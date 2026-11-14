// Bridge between BotOrderExecutor, PaperOrderLifecycleEngine, and D1AtomicLedgerBatcher.
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { LifecycleOrderRecord, PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, MICRO_USD_PER_USD, ZERO_BIGINT, type AtomicOrderStateUpsert,
  type D1AtomicLedgerBatcher, type DurableOrderLifecycleState, type LedgerAccountBalances, type MicroDoubleEntryLedger,
} from '../ledger';
import { applyLegsToBalances, createZeroAccountBalances } from '../ledger/double-entry-math';
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
type RequestWithOptionalClientOrderId = OrderRequest & { readonly clientOrderId?: string };

function toOrderStateUpsert(ord: LifecycleOrderRecord, override?: DurableOrderLifecycleState): AtomicOrderStateUpsert {
  return {
    clientOrderId: ord.clientOrderId, symbol: ord.symbol, side: ord.side, orderType: ord.type,
    quantityBase: ord.effectiveQtyBase, filledQtyBase: ord.filledQtyBase, limitPriceMicroUsd: ord.priceMicroUsd,
    reservedMarginMicroUsd: ord.reservedMicroUsd, reduceOnly: ord.reduceOnly,
    lifecycleState: override ?? DURABLE_STATE_MAP[ord.state], createdAtMs: ord.createdAtMs, updatedAtMs: ord.updatedAtMs,
  };
}

async function ensureSyncCursor(
  botId: string, ledger: MicroDoubleEntryLedger, batcher: D1AtomicLedgerBatcher, nowMs: number,
): Promise<DurableLedgerSyncCursor> {
  const existing = syncCursors.get(ledger);
  if (existing?.initialized) return existing;
  await batcher.initializeBotAccount(botId, nowMs, ledger.getFencingToken());
  const loaded = await batcher.loadDurableBotState(botId);
  const cursor: DurableLedgerSyncCursor = loaded && loaded.version > 0
    ? { initialized: true, version: loaded.version, balances: loaded.balances }
    : { initialized: true, version: 0, balances: createZeroAccountBalances() };
  syncCursors.set(ledger, cursor);
  return cursor;
}

async function flushUncommittedJournalEntries(
  ctx: OrderContext, ledger: MicroDoubleEntryLedger, batcher: D1AtomicLedgerBatcher,
  nowMs: number, finalOrderUpsert?: AtomicOrderStateUpsert,
): Promise<boolean> {
  const cursor = await ensureSyncCursor(ctx.botId, ledger, batcher, nowMs);
  const pending = ledger.getJournalEntries().filter((e) => e.version > cursor.version);
  if (pending.length === 0) return false;

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    const nextBalances = applyLegsToBalances(cursor.balances, entry.legs);
    const cashOutflow = cursor.balances.CASH_AVAILABLE - nextBalances.CASH_AVAILABLE;
    const commitRes = await batcher.commitAtomicBatch({
      botId: ctx.botId, expectedVersion: cursor.version, fencingToken: ledger.getFencingToken(),
      requiredCashMicroUsd: cashOutflow > ZERO_BIGINT ? cashOutflow : ZERO_BIGINT,
      nextBalances, entry,
      ...(i === pending.length - 1 && finalOrderUpsert ? { orderUpsert: finalOrderUpsert } : {}),
    });
    if (!commitRes.ok) {
      ctx.emitTelemetry('error', { error: commitRes.error, context: 'bot.ledgerBatcher' });
      throw new Error(`Durable ledger commit failed: ${commitRes.error}`);
    }
    cursor.version = commitRes.data.committedVersion;
    cursor.balances = nextBalances;
  }
  return true;
}

function allocateDefaultOrderId(lifecycleEngine: PaperOrderLifecycleEngine, botId: string, orderCounter: number): string {
  const nextAttempt = Math.max(orderCounter + 1, (lifecycleAttemptCounters.get(lifecycleEngine) ?? 0) + 1);
  lifecycleAttemptCounters.set(lifecycleEngine, nextAttempt);
  return `ord_${botId}_${nextAttempt}`;
}

export async function submitLifecyclePreDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  req: OrderRequest, orderCounter: number, effectivePrice: number,
): Promise<LifecycleOrderRecord> {
  const rawClientId = (req as RequestWithOptionalClientOrderId).clientOrderId;
  const idempotencyKey = rawClientId && rawClientId.trim().length > 0
    ? rawClientId.trim() : allocateDefaultOrderId(lifecycleEngine, ctx.botId, orderCounter);
  const quantityBase = BigInt(Math.max(1, Math.round(req.quantity * BASE_SCALE)));
  const priceMicroUsd = BigInt(Math.max(1, Math.round(effectivePrice * MICRO_SCALE)));
  const nowMs = Date.now();

  const sub = lifecycleEngine.submitOrder({
    idempotencyKey, symbol: req.symbol, side: req.side, type: req.type, quantityBase, priceMicroUsd, nowMs,
  });
  if (!sub.ok) {
    ctx.emitTelemetry('error', { error: sub.error, context: 'bot.lifecycleEngine' });
    throw new Error(`Order rejected by PaperOrderLifecycleEngine: ${sub.error}`);
  }
  if (sub.data.deduplicated) {
    ctx.emitTelemetry('error', { error: `DUPLICATE_CLIENT_ORDER_ID: ${idempotencyKey}`, context: 'bot.lifecycleEngine' });
    throw new Error(`Order rejected by PaperOrderLifecycleEngine: DUPLICATE_CLIENT_ORDER_ID (${idempotencyKey})`);
  }

  const batcher = ctx.deps.ledgerBatcher;
  if (batcher) {
    try {
      const ledger = lifecycleEngine.getLedger();
      await flushUncommittedJournalEntries(ctx, ledger, batcher, nowMs);
      const intentRes = await batcher.writePendingOrderIntent(
        ctx.botId, ledger.getFencingToken(), toOrderStateUpsert(sub.data.order, 'PENDING_INTENT'),
      );
      if (!intentRes.ok) {
        ctx.emitTelemetry('error', { error: intentRes.error, context: 'bot.ledgerBatcher' });
        throw new Error(`Durable pending order intent failed: ${intentRes.error}`);
      }
    } catch (persistErr) {
      lifecycleEngine.rejectOrder(sub.data.order.clientOrderId, nowMs);
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
    feeMicroUsd: BigInt(Math.max(0, Math.round((result.fee ?? 0) * MICRO_SCALE))),
    timestampMs: nowMs,
  });
  if (!fillRes.ok) {
    ctx.emitTelemetry('error', { error: fillRes.error, context: 'bot.lifecycleEngine' });
    throw new Error(`Order fill rejected by PaperOrderLifecycleEngine: ${fillRes.error}`);
  }
  return fillRes.data.order;
}

function applyTerminalResultToLifecycle(
  lifecycleEngine: PaperOrderLifecycleEngine, clientOrderId: string,
  status: 'cancelled' | 'rejected' | 'expired', nowMs: number, fallback: LifecycleOrderRecord,
): LifecycleOrderRecord {
  const termRes = status === 'cancelled'
    ? lifecycleEngine.cancelOrder(clientOrderId, nowMs)
    : status === 'rejected'
      ? lifecycleEngine.rejectOrder(clientOrderId, nowMs)
      : lifecycleEngine.expireOrder(clientOrderId, nowMs);
  return termRes.ok ? termRes.data : fallback;
}

export async function settleLifecyclePostDispatch(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine,
  submittedOrder: LifecycleOrderRecord, effectivePrice: number, result: OrderResult,
): Promise<void> {
  const nowMs = result.timestamp > 0 ? result.timestamp : Date.now();
  let updatedOrder: LifecycleOrderRecord = submittedOrder;

  if ((result.status === 'filled' || result.status === 'partially_filled') && result.filled > 0) {
    updatedOrder = applyFillResultToLifecycle(ctx, lifecycleEngine, submittedOrder, effectivePrice, result, nowMs);
  } else if (result.status === 'cancelled' || result.status === 'rejected' || result.status === 'expired') {
    updatedOrder = applyTerminalResultToLifecycle(lifecycleEngine, submittedOrder.clientOrderId, result.status, nowMs, submittedOrder);
  }

  const batcher = ctx.deps.ledgerBatcher;
  if (batcher) {
    const ledger = lifecycleEngine.getLedger();
    const upsert = toOrderStateUpsert(updatedOrder);
    const committed = await flushUncommittedJournalEntries(ctx, ledger, batcher, nowMs, upsert);
    if (!committed) {
      const intentRes = await batcher.writePendingOrderIntent(ctx.botId, ledger.getFencingToken(), upsert);
      if (!intentRes.ok) {
        ctx.emitTelemetry('error', { error: intentRes.error, context: 'bot.ledgerBatcher' });
        throw new Error(`Durable order state update failed: ${intentRes.error}`);
      }
    }
  }
}

export async function releaseLifecycleOnDispatchThrow(
  ctx: OrderContext, lifecycleEngine: PaperOrderLifecycleEngine, clientOrderId: string,
): Promise<void> {
  const nowMs = Date.now();
  const rej = lifecycleEngine.rejectOrder(clientOrderId, nowMs);
  if (rej.ok && ctx.deps.ledgerBatcher) {
    const ledger = lifecycleEngine.getLedger();
    const upsert = toOrderStateUpsert(rej.data);
    const committed = await flushUncommittedJournalEntries(ctx, ledger, ctx.deps.ledgerBatcher, nowMs, upsert);
    if (!committed) {
      await ctx.deps.ledgerBatcher.writePendingOrderIntent(ctx.botId, ledger.getFencingToken(), upsert);
    }
  }
}
