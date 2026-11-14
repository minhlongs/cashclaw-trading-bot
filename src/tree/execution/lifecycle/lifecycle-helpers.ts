// Gate G9: Pure Deterministic Helpers for Paper Order Lifecycle State Machine.

import { ok, err, type Result } from '@/lib/result';
import { BPS_SCALE, ZERO_BIGINT, absBigInt } from '../../ledger';
import type {
  LifecycleOrderRecord,
  PaperLifecycleOrderState,
  SubmitLifecycleOrderInput,
} from './lifecycle-types';

export function isTerminalOrderState(state: PaperLifecycleOrderState): boolean {
  return (
    state === 'filled' ||
    state === 'cancelled' ||
    state === 'rejected' ||
    state === 'expired'
  );
}

export function isUncertainAckState(state: PaperLifecycleOrderState): boolean {
  return state === 'PENDING_ACK' || state === 'RECONCILING';
}

export function matchesOrderPayload(
  existing: LifecycleOrderRecord,
  input: SubmitLifecycleOrderInput,
): boolean {
  return (
    existing.symbol === input.symbol &&
    existing.side === input.side &&
    existing.type === input.type &&
    existing.requestedQtyBase === input.quantityBase &&
    existing.priceMicroUsd === input.priceMicroUsd &&
    existing.reduceOnly === Boolean(input.reduceOnly)
  );
}

export function computeProportionalMarginRelease(
  reservedMicroUsd: bigint,
  remainingQtyBase: bigint,
  deltaFillQtyBase: bigint,
): bigint {
  if (reservedMicroUsd <= ZERO_BIGINT || deltaFillQtyBase <= ZERO_BIGINT) {
    return ZERO_BIGINT;
  }
  if (deltaFillQtyBase >= remainingQtyBase) {
    return reservedMicroUsd;
  }
  return (reservedMicroUsd * deltaFillQtyBase) / remainingQtyBase;
}

export function evaluateReduceOnlyOrderQty(
  currentSignedPosQtyBase: bigint,
  pendingReduceOnlyRemainingQtyBase: bigint,
  side: 'buy' | 'sell',
  requestedQtyBase: bigint,
): Result<{ readonly effectiveQtyBase: bigint; readonly clipped: boolean }> {
  if (currentSignedPosQtyBase === ZERO_BIGINT) {
    return err('REDUCE_ONLY_REJECTED: position is flat (0 base units)');
  }
  const sameSide =
    (currentSignedPosQtyBase > ZERO_BIGINT && side === 'buy') ||
    (currentSignedPosQtyBase < ZERO_BIGINT && side === 'sell');
  if (sameSide) {
    return err('REDUCE_ONLY_REJECTED: same-side reduceOnly order cannot increase position');
  }
  const reducibleQtyBase = absBigInt(currentSignedPosQtyBase) - pendingReduceOnlyRemainingQtyBase;
  if (reducibleQtyBase <= ZERO_BIGINT) {
    return err('REDUCE_ONLY_REJECTED: existing open reduceOnly orders already exhaust position');
  }
  if (requestedQtyBase > reducibleQtyBase) {
    return ok({ effectiveQtyBase: reducibleQtyBase, clipped: true });
  }
  return ok({ effectiveQtyBase: requestedQtyBase, clipped: false });
}

export function isAdversePriceMoveExceeded(
  filledSide: 'buy' | 'sell',
  entryPriceMicroUsd: bigint,
  currentMarkPriceMicroUsd: bigint,
  maxAdverseMoveBps: bigint,
): boolean {
  if (entryPriceMicroUsd <= ZERO_BIGINT || currentMarkPriceMicroUsd <= ZERO_BIGINT) {
    return false;
  }
  const adverseDelta =
    filledSide === 'buy'
      ? entryPriceMicroUsd - currentMarkPriceMicroUsd
      : currentMarkPriceMicroUsd - entryPriceMicroUsd;
  if (adverseDelta <= ZERO_BIGINT) {
    return false;
  }
  return adverseDelta * BPS_SCALE > entryPriceMicroUsd * maxAdverseMoveBps;
}

export function sumActiveReduceOnlyQty(
  orders: Iterable<LifecycleOrderRecord>,
  symbol: string,
  side: 'buy' | 'sell',
): bigint {
  let sum = ZERO_BIGINT;
  for (const ord of orders) {
    if (ord.symbol === symbol && ord.side === side && ord.reduceOnly && !isTerminalOrderState(ord.state)) {
      sum += ord.remainingQtyBase;
    }
  }
  return sum;
}

export function checkOrderSubmissionGuards(
  orders: ReadonlyMap<string, LifecycleOrderRecord>,
  key: string,
  input: SubmitLifecycleOrderInput,
): Result<LifecycleOrderRecord | null> {
  if (!key || !input.symbol.trim() || input.quantityBase <= ZERO_BIGINT || input.priceMicroUsd <= ZERO_BIGINT) {
    return err('INVALID_ORDER_PARAMS: idempotencyKey, symbol, quantityBase > 0, and priceMicroUsd > 0 required');
  }
  if (input.replacesClientOrderId) {
    const prev = orders.get(input.replacesClientOrderId);
    if (prev && isUncertainAckState(prev.state)) return err(`RECONCILIATION_REQUIRED: ${prev.clientOrderId}`);
  }
  const existing = orders.get(key);
  if (!existing) return ok(null);
  if (!matchesOrderPayload(existing, input)) return err(`IDEMPOTENCY_PAYLOAD_MISMATCH: ${key}`);
  if (isUncertainAckState(existing.state)) return err(`RECONCILIATION_REQUIRED: ${key} is ${existing.state}`);
  return ok(existing);
}

