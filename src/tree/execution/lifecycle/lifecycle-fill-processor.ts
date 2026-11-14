// Gate G9: Pure Submission Validation & Fill Application Processors.

import { ok, err, type Result } from '@/lib/result';
import {
  BASE_UNITS_PER_ASSET,
  type MicroDoubleEntryLedger,
  ZERO_BIGINT,
  absBigInt,
  computeNotionalMicroUsd,
} from '../../ledger';
import {
  computeProportionalMarginRelease,
  isTerminalOrderState,
} from './lifecycle-helpers';
import type {
  ApplyFillEventOutcome,
  LifecycleFillEvent,
  LifecycleOrderRecord,
} from './lifecycle-types';

function validateFillPreconditions(
  ord: LifecycleOrderRecord,
  event: LifecycleFillEvent,
  ledger: MicroDoubleEntryLedger,
): Result<{ readonly lateCancel: boolean }> {
  const lateCancel =
    ord.state === 'cancelled' &&
    ord.cancelUncertaintyUntilMs !== undefined &&
    event.timestampMs <= ord.cancelUncertaintyUntilMs;
  if (ord.filledQtyBase + event.fillQtyBase > ord.effectiveQtyBase) {
    return err(`OVERFILL_GUARD: fill exceeds order effectiveQtyBase ${ord.effectiveQtyBase.toString()}`);
  }
  if (isTerminalOrderState(ord.state) && !lateCancel) {
    return err(`TERMINAL_ORDER_IMMUTABLE: cannot apply fill to ${ord.state} order`);
  }
  if (ord.reduceOnly) {
    const pos = ledger.getPosition(ord.symbol);
    const validDir =
      (pos.signedQtyBase > ZERO_BIGINT && ord.side === 'sell') ||
      (pos.signedQtyBase < ZERO_BIGINT && ord.side === 'buy');
    if (!validDir || absBigInt(pos.signedQtyBase) < event.fillQtyBase) {
      return err('REDUCE_ONLY_REJECTED: fill would flip or increase position');
    }
  }
  return ok({ lateCancel });
}

export function processOrderFillEvent(
  orders: Map<string, LifecycleOrderRecord>,
  ledger: MicroDoubleEntryLedger,
  event: LifecycleFillEvent,
): Result<ApplyFillEventOutcome> {
  if (
    !event.fillEventId.trim() ||
    event.fillQtyBase <= ZERO_BIGINT ||
    event.fillPriceMicroUsd <= ZERO_BIGINT ||
    event.seq < 1
  ) {
    return err('INVALID_ORDER_PARAMS: invalid fill event parameters');
  }
  const ord = orders.get(event.clientOrderId);
  if (!ord) return err(`ORDER_NOT_FOUND: ${event.clientOrderId}`);
  if (ord.appliedFillIds.includes(event.fillEventId)) {
    return ok({
      order: ord,
      duplicateIgnored: true,
      lateCancelReconciled: false,
      releasedReservationMicroUsd: ZERO_BIGINT,
    });
  }

  const pre = validateFillPreconditions(ord, event, ledger);
  if (!pre.ok) return pre;

  const released = computeProportionalMarginRelease(
    ord.reservedMicroUsd,
    ord.remainingQtyBase,
    event.fillQtyBase,
  );
  const ledgerRes = ledger.applyFill({
    eventHash: `fill_${ord.clientOrderId}_${event.fillEventId}`,
    symbol: ord.symbol,
    side: ord.side,
    fillQtyBase: event.fillQtyBase,
    fillPriceMicroUsd: event.fillPriceMicroUsd,
    feeMicroUsd: event.feeMicroUsd ?? ZERO_BIGINT,
    releasedOrderMarginMicroUsd: released,
    marginRateBps: ord.marginRateBps,
    timestampMs: event.timestampMs,
  });
  if (!ledgerRes.ok) return err(ledgerRes.error);

  const newFilled = ord.filledQtyBase + event.fillQtyBase;
  const newNotional =
    ord.cumulativeFillNotionalMicroUsd +
    computeNotionalMicroUsd(event.fillQtyBase, event.fillPriceMicroUsd);
  const avgPrice = (newNotional * BASE_UNITS_PER_ASSET) / newFilled;
  const nextState =
    newFilled === ord.effectiveQtyBase
      ? 'filled'
      : pre.data.lateCancel
        ? 'cancelled'
        : 'partially_filled';

  const updated: LifecycleOrderRecord = {
    ...ord,
    filledQtyBase: newFilled,
    remainingQtyBase: ord.effectiveQtyBase - newFilled,
    reservedMicroUsd: ord.reservedMicroUsd - released,
    cumulativeFillNotionalMicroUsd: newNotional,
    avgFillPriceMicroUsd: avgPrice,
    state: nextState,
    appliedFillIds: [...ord.appliedFillIds, event.fillEventId],
    highestAppliedSeq: Math.max(ord.highestAppliedSeq, event.seq),
    firstFillAtMs: ord.firstFillAtMs ?? event.timestampMs,
    updatedAtMs: Math.max(ord.updatedAtMs, event.timestampMs),
  };
  orders.set(ord.clientOrderId, updated);
  return ok({
    order: updated,
    duplicateIgnored: false,
    lateCancelReconciled: pre.data.lateCancel,
    releasedReservationMicroUsd: released,
  });
}
