// Bridge between BotOrderExecutor, PaperOrderLifecycleEngine, and D1AtomicLedgerBatcher.
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { LifecycleOrderRecord, PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, MICRO_USD_PER_USD, ZERO_BIGINT,
  type AtomicOrderStateUpsert, type DurableOrderLifecycleState,
} from '../ledger';
import { createZeroAccountBalances } from '../ledger/double-entry-math';
import { restoreEngineFromDurableState } from './bot-ledger-hydration';
import {
  flushOrRecoverPostDispatch, flushPreDispatchAtomic, getOrCreateSyncCursor, lifecycleAttemptCounters,
} from './bot-lifecycle-sync-state';
import type { OrderContext } from './bot-order-executor-types';

const BASE_SCALE = Number(BASE_UNITS_PER_ASSET);
const MICRO_SCALE = Number(MICRO_USD_PER_USD);
const DURABLE_STATE_MAP: Record<LifecycleOrderRecord['state'], DurableOrderLifecycleState> = {
  PENDING_ACK: 'PENDING_ACK', RECONCILING: 'RECONCILING', open: 'OPEN', partially_filled: 'PARTIALLY_FILLED',
  filled: 'FILLED', cancelled: 'CANCELLED', rejected: 'REJECTED', expired: 'EXPIRED',
};
const venueOrderIdMap = new WeakMap<PaperOrderLifecycleEngine, Map<string, string>>();
type RequestWithOptionalClientOrderId = OrderRequest & { readonly clientOrderId?: string };

function getVenueMap(engine: PaperOrderLifecycleEngine): Map<string, string> {
  let map = venueOrderIdMap.get(engine);
  if (!map) { map = new Map<string, string>(); venueOrderIdMap.set(engine, map); }
  return map;
}

function toOrderStateUpsert(ord: LifecycleOrderRecord, override?: DurableOrderLifecycleState): AtomicOrderStateUpsert {
  const effectiveFillOrLimitPx = ord.avgFillPriceMicroUsd > ZERO_BIGINT ? ord.avgFillPriceMicroUsd : ord.priceMicroUsd;
  return {
    clientOrderId: ord.clientOrderId, symbol: ord.symbol, side: ord.side, orderType: ord.type,
    quantityBase: ord.effectiveQtyBase, filledQtyBase: ord.filledQtyBase, limitPriceMicroUsd: effectiveFillOrLimitPx,
    reservedMarginMicroUsd: ord.reservedMicroUsd, reduceOnly: ord.reduceOnly,
    lifecycleState: override ?? DURABLE_STATE_MAP[ord.state], createdAtMs: ord.createdAtMs, updatedAtMs: ord.updatedAtMs,
  };
}

export async function ensureDurableBotHydrated(ctx: OrderContext): Promise<void> {
  const { lifecycleEngine, ledgerBatcher } = ctx.deps;
  if (!lifecycleEngine || !ledgerBatcher) return;
  const ledger = lifecycleEngine.getLedger();
  const cursor = getOrCreateSyncCursor(ledger);
  if (cursor.haltedError) {
    ctx.emitTelemetry('error', { error: cursor.haltedError, context: 'bot.ledgerBatcher' });
    throw new Error(`Durable ledger halted (fail-closed): ${cursor.haltedError}`);
  }
  if (cursor.initialized) {
    if (cursor.needsPostDispatchRecovery || cursor.pendingOrderUpserts.size > 0) {
      await flushOrRecoverPostDispatch({
        ctx, ledger, batcher: ledgerBatcher,
        zeroStepErrorPrefix: 'Durable ledger recovery failed (fail-closed)',
        ledgerStepErrorPrefix: 'Durable ledger recovery failed (fail-closed)',
      });
    }
    return;
  }

  await ledgerBatcher.initializeBotAccount(ctx.botId, Date.now(), ledger.getFencingToken());
  const loaded = await ledgerBatcher.loadDurableBotState(ctx.botId);
  if (loaded && loaded.version > 0) {
    const maxSeq = restoreEngineFromDurableState(lifecycleEngine, loaded);
    if (maxSeq > (lifecycleAttemptCounters.get(lifecycleEngine) ?? 0)) lifecycleAttemptCounters.set(lifecycleEngine, maxSeq);
    cursor.initialized = true;
    cursor.version = loaded.version;
    cursor.balances = { ...loaded.balances };
  } else {
    cursor.initialized = true;
    cursor.version = 0;
    cursor.balances = createZeroAccountBalances();
  }
}

export async function submitLifecyclePreDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  req: OrderRequest, orderCounter: number, effectivePrice: number, reduceOnly = false,
): Promise<LifecycleOrderRecord> {
  await ensureDurableBotHydrated(ctx);
  const ledger = lifecycleEngine.getLedger();
  const preSubmitSnapshot = ledger.exportSnapshot();

  const rawClientId = (req as RequestWithOptionalClientOrderId).clientOrderId;
  const nextAttempt = Math.max(orderCounter + 1, (lifecycleAttemptCounters.get(lifecycleEngine) ?? 0) + 1);
  if (!rawClientId?.trim()) lifecycleAttemptCounters.set(lifecycleEngine, nextAttempt);
  const idempotencyKey = rawClientId?.trim() ? rawClientId.trim() : `ord_${ctx.botId}_${nextAttempt}`;
  const quantityBase = BigInt(Math.max(1, Math.round(req.quantity * BASE_SCALE)));
  const priceMicroUsd = BigInt(Math.max(1, Math.round(effectivePrice * MICRO_SCALE)));
  const nowMs = Date.now();

  const sub = lifecycleEngine.submitOrder({
    idempotencyKey, symbol: req.symbol, side: req.side, type: req.type, quantityBase, priceMicroUsd, reduceOnly, nowMs,
  });
  if (!sub.ok) {
    ctx.emitTelemetry('error', { error: sub.error, context: 'bot.lifecycleEngine' });
    throw new Error(`Order rejected by PaperOrderLifecycleEngine: ${sub.error}`);
  }
  if (sub.data.deduplicated) {
    ctx.emitTelemetry('error', { error: `DUPLICATE_CLIENT_ORDER_ID: ${idempotencyKey}`, context: 'bot.lifecycleEngine' });
    throw new Error(`Order rejected by PaperOrderLifecycleEngine: DUPLICATE_CLIENT_ORDER_ID (${idempotencyKey})`);
  }

  if (ctx.deps.ledgerBatcher) {
    await flushPreDispatchAtomic({
      ctx, lifecycleEngine, batcher: ctx.deps.ledgerBatcher,
      order: sub.data.order, upsert: toOrderStateUpsert(sub.data.order, 'PENDING_INTENT'),
      preSubmitSnapshot, nowMs,
    });
  }
  return sub.data.order;
}

function applyFillResultToLifecycle(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  submittedOrder: LifecycleOrderRecord, effectivePrice: number, result: OrderResult, nowMs: number,
): LifecycleOrderRecord {
  const rawFillQty = BigInt(Math.max(1, Math.round(result.filled * BASE_SCALE)));
  const fillQtyBase = result.status === 'filled' || rawFillQty > submittedOrder.effectiveQtyBase
    ? submittedOrder.effectiveQtyBase : rawFillQty;
  const resolvedPrice = result.price > 0 ? result.price : effectivePrice;
  const fillRes = lifecycleEngine.applyFillEvent({
    fillEventId: result.id || `fill_${submittedOrder.clientOrderId}`,
    clientOrderId: submittedOrder.clientOrderId, seq: 1, fillQtyBase,
    fillPriceMicroUsd: BigInt(Math.max(1, Math.round(resolvedPrice * MICRO_SCALE))),
    feeMicroUsd: BigInt(Math.max(0, Math.round((result.fee ?? 0) * MICRO_SCALE))), timestampMs: nowMs,
  });
  if (!fillRes.ok) {
    if (ctx.deps.ledgerBatcher) getOrCreateSyncCursor(lifecycleEngine.getLedger()).haltedError = fillRes.error;
    ctx.emitTelemetry('error', { error: fillRes.error, context: 'bot.lifecycleEngine' });
    throw new Error(`Order fill rejected by PaperOrderLifecycleEngine: ${fillRes.error}`);
  }
  return fillRes.data.order;
}

async function ensureCursorReady(ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine): Promise<void> {
  if (ctx.deps.ledgerBatcher && !getOrCreateSyncCursor(lifecycleEngine.getLedger()).initialized) {
    await ensureDurableBotHydrated(ctx);
  }
}

export async function settleLifecyclePostDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  submittedOrder: LifecycleOrderRecord, effectivePrice: number, result: OrderResult,
): Promise<void> {
  await ensureCursorReady(ctx, lifecycleEngine);
  const nowMs = result.timestamp > 0 ? result.timestamp : Date.now();
  if (result.id) getVenueMap(lifecycleEngine).set(result.id, submittedOrder.clientOrderId);
  let updatedOrder: LifecycleOrderRecord = submittedOrder;

  if ((result.status === 'filled' || result.status === 'partially_filled') && result.filled > 0) {
    updatedOrder = applyFillResultToLifecycle(ctx, lifecycleEngine, submittedOrder, effectivePrice, result, nowMs);
  } else if (result.status === 'cancelled' || result.status === 'rejected' || result.status === 'expired') {
    const id = submittedOrder.clientOrderId;
    const res = result.status === 'cancelled' ? lifecycleEngine.cancelOrder(id, nowMs)
      : result.status === 'rejected' ? lifecycleEngine.rejectOrder(id, nowMs) : lifecycleEngine.expireOrder(id, nowMs);
    updatedOrder = res.ok ? res.data : submittedOrder;
  }
  if (ctx.deps.ledgerBatcher) {
    await flushOrRecoverPostDispatch({
      ctx, ledger: lifecycleEngine.getLedger(), batcher: ctx.deps.ledgerBatcher, upsert: toOrderStateUpsert(updatedOrder),
      zeroStepErrorPrefix: 'Durable order state update failed', ledgerStepErrorPrefix: 'Durable ledger commit failed',
    });
  }
}

export async function cancelLifecycleOrder(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine, orderIdOrClientId: string,
): Promise<void> {
  await ensureCursorReady(ctx, lifecycleEngine);
  const resolvedId = getVenueMap(lifecycleEngine).get(orderIdOrClientId) ?? orderIdOrClientId;
  const cancelRes = lifecycleEngine.cancelOrder(resolvedId, Date.now());
  if (cancelRes.ok && ctx.deps.ledgerBatcher) {
    await flushOrRecoverPostDispatch({
      ctx, ledger: lifecycleEngine.getLedger(), batcher: ctx.deps.ledgerBatcher, upsert: toOrderStateUpsert(cancelRes.data),
      zeroStepErrorPrefix: 'Durable order cancel state update failed', ledgerStepErrorPrefix: 'Durable ledger commit failed',
    });
  }
}

export async function releaseLifecycleOnDispatchThrow(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine, clientOrderId: string,
): Promise<void> {
  await ensureCursorReady(ctx, lifecycleEngine);
  const rej = lifecycleEngine.rejectOrder(clientOrderId, Date.now());
  if (rej.ok && ctx.deps.ledgerBatcher) {
    await flushOrRecoverPostDispatch({
      ctx, ledger: lifecycleEngine.getLedger(), batcher: ctx.deps.ledgerBatcher, upsert: toOrderStateUpsert(rej.data),
      zeroStepErrorPrefix: 'Durable order release state update failed', ledgerStepErrorPrefix: 'Durable ledger commit failed',
    });
  }
}
