// Durable D1 State Rehydration for MicroDoubleEntryLedger & PaperOrderLifecycleEngine.
// Restores account balances, processed event hashes, open positions, and active order intents
// after 30s BotManager cache eviction or Cloudflare Worker isolate recycle.

import type { LifecycleOrderRecord, PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BPS_SCALE, ZERO_BIGINT, computeNotionalMicroUsd,
  type DurableOrderIntentRow, type DurableOrderLifecycleState,
  type LedgerPositionRecord, type LoadedDurableLedgerState,
} from '../ledger';
import { buildFillTransitionPlan } from '../ledger/double-entry-math';

const REVERSE_STATE_MAP: Record<DurableOrderLifecycleState, LifecycleOrderRecord['state']> = {
  PENDING_INTENT: 'PENDING_ACK',
  PENDING_ACK: 'PENDING_ACK',
  RECONCILING: 'RECONCILING',
  OPEN: 'open',
  PARTIALLY_FILLED: 'partially_filled',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

function parseOrderSeq(clientOrderId: string): number {
  const match = /_(\d+)$/.exec(clientOrderId);
  return match ? Number(match[1]) : 0;
}

function toLifecycleRecord(row: DurableOrderIntentRow): LifecycleOrderRecord {
  const remaining = row.quantityBase > row.filledQtyBase ? row.quantityBase - row.filledQtyBase : ZERO_BIGINT;
  const fillNotional = computeNotionalMicroUsd(row.filledQtyBase, row.limitPriceMicroUsd);
  return {
    clientOrderId: row.clientOrderId,
    symbol: row.symbol,
    side: row.side,
    type: row.orderType,
    requestedQtyBase: row.quantityBase,
    effectiveQtyBase: row.quantityBase,
    clippedByReduceOnly: false,
    filledQtyBase: row.filledQtyBase,
    remainingQtyBase: remaining,
    priceMicroUsd: row.limitPriceMicroUsd,
    cumulativeFillNotionalMicroUsd: fillNotional,
    avgFillPriceMicroUsd: row.filledQtyBase > ZERO_BIGINT ? row.limitPriceMicroUsd : ZERO_BIGINT,
    reduceOnly: row.reduceOnly,
    marginRateBps: BPS_SCALE,
    initialReservedMicroUsd: row.reservedMarginMicroUsd,
    reservedMicroUsd: row.reservedMarginMicroUsd,
    state: REVERSE_STATE_MAP[row.lifecycleState],
    appliedFillIds: row.filledQtyBase > ZERO_BIGINT ? [`hydrated_${row.clientOrderId}`] : [],
    highestAppliedSeq: row.filledQtyBase > ZERO_BIGINT ? 1 : 0,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  };
}

function reconstructPositionsFromOrderIntents(intents: readonly DurableOrderIntentRow[]): LedgerPositionRecord[] {
  const bySymbol = new Map<string, LedgerPositionRecord>();
  for (const row of intents) {
    if (row.filledQtyBase <= ZERO_BIGINT) continue;
    const prev = bySymbol.get(row.symbol) ?? {
      symbol: row.symbol,
      signedQtyBase: ZERO_BIGINT,
      openNotionalMicroUsd: ZERO_BIGINT,
      openMarginMicroUsd: ZERO_BIGINT,
    };
    const plan = buildFillTransitionPlan(prev, {
      eventHash: `hydrate_${row.clientOrderId}`,
      symbol: row.symbol,
      side: row.side,
      fillQtyBase: row.filledQtyBase,
      fillPriceMicroUsd: row.limitPriceMicroUsd,
      feeMicroUsd: ZERO_BIGINT,
      releasedOrderMarginMicroUsd: ZERO_BIGINT,
      timestampMs: row.updatedAtMs,
    });
    bySymbol.set(row.symbol, plan.nextPosition);
  }
  return Array.from(bySymbol.values()).filter((p) => p.signedQtyBase !== ZERO_BIGINT);
}

export function restoreEngineFromDurableState(
  lifecycleEngine: PaperOrderLifecycleEngine,
  loaded: LoadedDurableLedgerState,
): number {
  const ledger = lifecycleEngine.getLedger();
  const positions = reconstructPositionsFromOrderIntents(loaded.orderIntents);
  const snapRes = ledger.restoreSnapshot({
    botId: loaded.botId,
    version: loaded.version,
    fencingToken: loaded.fencingToken,
    balances: loaded.balances,
    positions,
    processedEventHashes: loaded.processedEventHashes,
  });
  if (!snapRes.ok) {
    throw new Error(`Durable ledger snapshot corrupt: ${snapRes.error}`);
  }
  let maxSeq = 0;
  for (const row of loaded.orderIntents) {
    lifecycleEngine.hydrateOrderRecord(toLifecycleRecord(row));
    const seq = parseOrderSeq(row.clientOrderId);
    if (seq > maxSeq) maxSeq = seq;
  }
  return maxSeq;
}
