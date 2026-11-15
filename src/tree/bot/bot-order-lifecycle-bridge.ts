// Bridge between BotOrderExecutor, PaperOrderLifecycleEngine, and D1AtomicLedgerBatcher.
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { LifecycleOrderRecord, PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, MICRO_USD_PER_USD, ZERO_BIGINT, type AtomicOrderStateUpsert,
  type D1AtomicLedgerBatcher, type DurableOrderLifecycleState, type LedgerAccountBalances, type MicroDoubleEntryLedger,
} from '../ledger';
import { applyLegsToBalances, createZeroAccountBalances } from '../ledger/double-entry-math';
import { restoreEngineFromDurableState } from './bot-ledger-hydration';
import type { OrderContext } from './bot-order-executor-types';

const BASE_SCALE = Number(BASE_UNITS_PER_ASSET);
const MICRO_SCALE = Number(MICRO_USD_PER_USD);
const DURABLE_STATE_MAP: Record<LifecycleOrderRecord['state'], DurableOrderLifecycleState> = {
  PENDING_ACK: 'PENDING_ACK', RECONCILING: 'RECONCILING', open: 'OPEN', partially_filled: 'PARTIALLY_FILLED',
  filled: 'FILLED', cancelled: 'CANCELLED', rejected: 'REJECTED', expired: 'EXPIRED',
};
interface DurableLedgerSyncCursor { initialized: boolean; version: number; balances: LedgerAccountBalances; }
const syncCursors = new WeakMap<MicroDoubleEntryLedger, DurableLedgerSyncCursor>();
const lifecycleAttemptCounters = new WeakMap<PaperOrderLifecycleEngine, number>();
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
  if (syncCursors.get(ledger)?.initialized) return;

  await ledgerBatcher.initializeBotAccount(ctx.botId, Date.now(), ledger.getFencingToken());
  const loaded = await ledgerBatcher.loadDurableBotState(ctx.botId);
  if (loaded && loaded.version > 0) {
    const maxSeq = restoreEngineFromDurableState(lifecycleEngine, loaded);
    if (maxSeq > (lifecycleAttemptCounters.get(lifecycleEngine) ?? 0)) lifecycleAttemptCounters.set(lifecycleEngine, maxSeq);
    syncCursors.set(ledger, { initialized: true, version: loaded.version, balances: loaded.balances });
  } else {
    syncCursors.set(ledger, { initialized: true, version: 0, balances: createZeroAccountBalances() });
  }
}

async function flushOrWriteUpsert(
  ctx: OrderContext, ledger: MicroDoubleEntryLedger, batcher: D1AtomicLedgerBatcher,
  upsert?: AtomicOrderStateUpsert, throwOnIntentFail?: string,
): Promise<void> {
  await ensureDurableBotHydrated(ctx);
  const cursor = syncCursors.get(ledger)!;
  const pending = ledger.getJournalEntries().filter((e) => e.version > cursor.version);
  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]!;
    const nextBalances = applyLegsToBalances(cursor.balances, entry.legs);
    const cashOutflow = cursor.balances.CASH_AVAILABLE - nextBalances.CASH_AVAILABLE;
    const isLast = i === pending.length - 1;
    const commitRes = await batcher.commitAtomicBatch({
      botId: ctx.botId, expectedVersion: cursor.version, fencingToken: ledger.getFencingToken(),
      requiredCashMicroUsd: cashOutflow > ZERO_BIGINT ? cashOutflow : ZERO_BIGINT, nextBalances, entry,
      ...(isLast && upsert ? { orderUpsert: upsert } : {}),
      ...(isLast ? { positions: ledger.getAllPositions() } : {}),
    });
    if (!commitRes.ok) {
      ctx.emitTelemetry('error', { error: commitRes.error, context: 'bot.ledgerBatcher' });
      throw new Error(`Durable ledger commit failed: ${commitRes.error}`);
    }
    cursor.version = commitRes.data.committedVersion;
    cursor.balances = nextBalances;
  }
  if (pending.length === 0 && upsert) {
    const intentRes = await batcher.writePendingOrderIntent(ctx.botId, ledger.getFencingToken(), upsert);
    if (!intentRes.ok && throwOnIntentFail) {
      ctx.emitTelemetry('error', { error: intentRes.error, context: 'bot.ledgerBatcher' });
      throw new Error(`${throwOnIntentFail}: ${intentRes.error}`);
    }
  }
}

export async function submitLifecyclePreDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  req: OrderRequest, orderCounter: number, effectivePrice: number, reduceOnly = false,
): Promise<LifecycleOrderRecord> {
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
    const ledger = lifecycleEngine.getLedger();
    try {
      await flushOrWriteUpsert(ctx, ledger, ctx.deps.ledgerBatcher, toOrderStateUpsert(sub.data.order, 'PENDING_INTENT'), 'Durable pending order intent failed');
    } catch (persistErr) {
      lifecycleEngine.rejectOrder(sub.data.order.clientOrderId, nowMs);
      await flushOrWriteUpsert(ctx, ledger, ctx.deps.ledgerBatcher).catch(() => {});
      throw persistErr;
    }
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
    ctx.emitTelemetry('error', { error: fillRes.error, context: 'bot.lifecycleEngine' });
    throw new Error(`Order fill rejected by PaperOrderLifecycleEngine: ${fillRes.error}`);
  }
  return fillRes.data.order;
}

export async function settleLifecyclePostDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  submittedOrder: LifecycleOrderRecord, effectivePrice: number, result: OrderResult,
): Promise<void> {
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
    await flushOrWriteUpsert(ctx, lifecycleEngine.getLedger(), ctx.deps.ledgerBatcher, toOrderStateUpsert(updatedOrder), 'Durable order state update failed');
  }
}

export async function cancelLifecycleOrder(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine, orderIdOrClientId: string,
): Promise<void> {
  const resolvedId = getVenueMap(lifecycleEngine).get(orderIdOrClientId) ?? orderIdOrClientId;
  const cancelRes = lifecycleEngine.cancelOrder(resolvedId, Date.now());
  if (cancelRes.ok && ctx.deps.ledgerBatcher) {
    await flushOrWriteUpsert(ctx, lifecycleEngine.getLedger(), ctx.deps.ledgerBatcher, toOrderStateUpsert(cancelRes.data));
  }
}

export async function releaseLifecycleOnDispatchThrow(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine, clientOrderId: string,
): Promise<void> {
  const rej = lifecycleEngine.rejectOrder(clientOrderId, Date.now());
  if (rej.ok && ctx.deps.ledgerBatcher) {
    await flushOrWriteUpsert(ctx, lifecycleEngine.getLedger(), ctx.deps.ledgerBatcher, toOrderStateUpsert(rej.data));
  }
}
