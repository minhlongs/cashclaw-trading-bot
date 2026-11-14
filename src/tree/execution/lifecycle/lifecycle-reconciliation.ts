// Gate G9: Venue Snapshot Reconciliation & Paired-Leg Execution Guard.

import { ok, err, type Result } from '@/lib/result';
import { ZERO_BIGINT } from '../../ledger';
import { isAdversePriceMoveExceeded, isTerminalOrderState } from './lifecycle-helpers';
import type {
  ApplyFillEventOutcome,
  LifecycleFillEvent,
  LifecycleOrderRecord,
  PairedLegEvaluation,
  PairedLegRegistration,
  PairedLegStrategyState,
  ReconcileSnapshotOutcome,
  VenueOrderSnapshot,
} from './lifecycle-types';

export interface StoredPairedLegRecord {
  readonly registration: Required<PairedLegRegistration>;
  state: PairedLegStrategyState;
}

export interface ReconciliationEngineHooks {
  getOrdersValues(): Iterable<LifecycleOrderRecord>;
  setOrder(record: LifecycleOrderRecord): void;
  applyFillEvent(event: LifecycleFillEvent): Result<ApplyFillEventOutcome>;
  terminateAndReleaseMargin(
    clientOrderId: string,
    targetState: 'cancelled' | 'rejected' | 'expired',
    nowMs: number,
  ): Result<LifecycleOrderRecord>;
}

function applySnapshotFills(
  hooks: ReconciliationEngineHooks,
  order: LifecycleOrderRecord,
  snap: VenueOrderSnapshot,
  nowMs: number,
): Result<LifecycleOrderRecord> {
  let latest = order;
  if (snap.fills && snap.fills.length > 0) {
    for (const fill of snap.fills) {
      const res = hooks.applyFillEvent(fill);
      if (!res.ok) return res;
      latest = res.data.order;
    }
    return ok(latest);
  }
  if (snap.filledQtyBase > order.filledQtyBase) {
    const delta = snap.filledQtyBase - order.filledQtyBase;
    const fillRes = hooks.applyFillEvent({
      fillEventId: `venue_reconcile_${order.clientOrderId}_${snap.filledQtyBase.toString()}`,
      clientOrderId: order.clientOrderId,
      seq: order.highestAppliedSeq + 1,
      fillQtyBase: delta,
      fillPriceMicroUsd: snap.avgFillPriceMicroUsd ?? order.priceMicroUsd,
      feeMicroUsd: snap.feeMicroUsd ?? ZERO_BIGINT,
      timestampMs: nowMs,
    });
    if (!fillRes.ok) return fillRes;
    latest = fillRes.data.order;
  }
  return ok(latest);
}

function resolveVenueMatchedOrder(
  hooks: ReconciliationEngineHooks,
  order: LifecycleOrderRecord,
  snap: VenueOrderSnapshot,
  nowMs: number,
): Result<LifecycleOrderRecord> {
  const afterFills = applySnapshotFills(hooks, order, snap, nowMs);
  if (!afterFills.ok) return afterFills;
  const current = afterFills.data;

  if (snap.status === 'cancelled' || snap.status === 'rejected' || snap.status === 'expired') {
    if (isTerminalOrderState(current.state)) return ok(current);
    return hooks.terminateAndReleaseMargin(current.clientOrderId, snap.status, nowMs);
  }

  const nextState =
    current.filledQtyBase >= current.effectiveQtyBase
      ? 'filled'
      : current.filledQtyBase > ZERO_BIGINT
        ? 'partially_filled'
        : 'open';
  const resolved: LifecycleOrderRecord = {
    ...current,
    state: nextState,
    reconcileDeadlineMs: undefined,
    updatedAtMs: nowMs,
  };
  hooks.setOrder(resolved);
  return ok(resolved);
}

export function runVenueSnapshotReconciliation(
  hooks: ReconciliationEngineHooks,
  venueOrders: readonly VenueOrderSnapshot[],
  nowMs: number,
): Result<ReconcileSnapshotOutcome> {
  const venueByClientId = new Map<string, VenueOrderSnapshot>();
  for (const snap of venueOrders) venueByClientId.set(snap.clientOrderId, snap);

  const reconciledOrders: LifecycleOrderRecord[] = [];
  const expiredAbsentOrderIds: string[] = [];
  const stillReconcilingOrderIds: string[] = [];

  for (const order of Array.from(hooks.getOrdersValues())) {
    if (order.state !== 'PENDING_ACK' && order.state !== 'RECONCILING') continue;
    const snap = venueByClientId.get(order.clientOrderId);
    if (snap) {
      const res = resolveVenueMatchedOrder(hooks, order, snap, nowMs);
      if (!res.ok) return res;
      reconciledOrders.push(res.data);
      continue;
    }
    if (order.reconcileDeadlineMs === undefined || nowMs >= order.reconcileDeadlineMs) {
      const expRes = hooks.terminateAndReleaseMargin(order.clientOrderId, 'expired', nowMs);
      if (!expRes.ok) return expRes;
      reconciledOrders.push(expRes.data);
      expiredAbsentOrderIds.push(order.clientOrderId);
    } else {
      const waiting: LifecycleOrderRecord = { ...order, state: 'RECONCILING', updatedAtMs: nowMs };
      hooks.setOrder(waiting);
      stillReconcilingOrderIds.push(order.clientOrderId);
    }
  }

  return ok({ reconciledOrders, expiredAbsentOrderIds, stillReconcilingOrderIds });
}

function classifyBrokenLegReason(
  legA: LifecycleOrderRecord,
  legB: LifecycleOrderRecord,
  maxLegDelayMs: number,
  adverseExceeded: boolean,
  nowMs: number,
): string | null {
  const legBFailed =
    legB.state === 'rejected' || legB.state === 'cancelled' || legB.state === 'expired';
  if (legBFailed) return `legB_${legB.state}`;
  if (legA.firstFillAtMs !== undefined && nowMs - legA.firstFillAtMs > maxLegDelayMs) {
    return `legB_unfilled_exceeded_${maxLegDelayMs}ms`;
  }
  if (adverseExceeded) return 'adverse_price_move_exceeded';
  return null;
}

export function evaluatePairedLegExecution(
  pair: StoredPairedLegRecord,
  legA: LifecycleOrderRecord | undefined,
  legB: LifecycleOrderRecord | undefined,
  currentMarkPriceMicroUsd: bigint,
  nowMs: number,
): Result<PairedLegEvaluation> {
  if (!legA || !legB) return err(`PAIR_NOT_FOUND: missing leg orders for pair ${pair.registration.pairId}`);
  const { pairId, maxLegDelayMs, maxAdverseMoveBps } = pair.registration;
  const unhedgedQtyBase =
    legA.filledQtyBase > legB.filledQtyBase ? legA.filledQtyBase - legB.filledQtyBase : ZERO_BIGINT;

  if (unhedgedQtyBase === ZERO_BIGINT) {
    if (legA.state === 'filled' && legB.state === 'filled' && pair.state !== 'SUSPENDED_BROKEN_LEG') {
      pair.state = 'HEDGED';
    }
    return ok({ pairId, state: pair.state, unhedgedQtyBase: ZERO_BIGINT, adverseMoveExceeded: false });
  }

  const adverseExceeded = isAdversePriceMoveExceeded(
    legA.side,
    legA.avgFillPriceMicroUsd,
    currentMarkPriceMicroUsd,
    maxAdverseMoveBps,
  );
  const triggerReason = classifyBrokenLegReason(legA, legB, maxLegDelayMs, adverseExceeded, nowMs);

  if (!triggerReason && pair.state === 'ACTIVE') {
    return ok({ pairId, state: 'ACTIVE', unhedgedQtyBase, adverseMoveExceeded: false });
  }
  pair.state = adverseExceeded || pair.state === 'SUSPENDED_BROKEN_LEG' ? 'SUSPENDED_BROKEN_LEG' : 'UNWINDING_BROKEN_LEG';

  return ok({
    pairId, state: pair.state, unhedgedQtyBase, adverseMoveExceeded: adverseExceeded,
    unwindIntent: {
      unwindClientOrderId: `unwind_${pairId}_${legA.clientOrderId}`, pairId,
      brokenLegOrderId: legA.clientOrderId, symbol: legA.symbol,
      side: legA.side === 'buy' ? 'sell' : 'buy', type: 'market',
      quantityBase: unhedgedQtyBase, reduceOnly: true,
      reason: triggerReason ?? 'pair_already_unwinding',
    },
  });
}
