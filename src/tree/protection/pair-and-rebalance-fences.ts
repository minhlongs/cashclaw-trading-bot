/**
 * Paired-trade broken-leg orphan unwinder (> 3s timeout + > 5% adverse strategy suspension),
 * V-reversal rebalance drift hysteresis, and explicit 8h FUNDING_CASHFLOW carry ledger guard.
 */

export interface BrokenPairLegInput {
  readonly pairStrategyId: string;
  readonly legASymbol: string;
  readonly legAFilledSignedQty: number;
  readonly legAEntryPrice: number;
  readonly legAMarkPrice: number;
  readonly legBStatus: 'FILLED' | 'REJECTED' | 'UNFILLED';
  readonly elapsedSinceLegAMs: number;
  readonly timeoutMs?: number;
  readonly suspendAdversePct?: number;
}

export interface BrokenPairLegDecision {
  readonly unwindOrphanLeg: boolean;
  readonly unwindSide: 'BUY' | 'SELL' | null;
  readonly unwindReduceOnlyQty: number;
  readonly adverseExcursionPct: number;
  readonly suspendPairStrategy: boolean;
  readonly action: 'PAIR_HEALTHY' | 'PENDING_LEG_B' | 'UNWIND_ORPHAN_LEG' | 'UNWIND_AND_SUSPEND_STRATEGY';
}

export function evaluateBrokenPairLeg(input: BrokenPairLegInput): BrokenPairLegDecision {
  const timeoutMs = input.timeoutMs ?? 3_000;
  const suspendThreshold = input.suspendAdversePct ?? 0.05;

  if (input.legBStatus === 'FILLED' || input.legAFilledSignedQty === 0) {
    return {
      unwindOrphanLeg: false,
      unwindSide: null,
      unwindReduceOnlyQty: 0,
      adverseExcursionPct: 0,
      suspendPairStrategy: false,
      action: 'PAIR_HEALTHY',
    };
  }

  const dir = input.legAFilledSignedQty > 0 ? 1 : -1;
  const pnlPct = dir * ((input.legAMarkPrice - input.legAEntryPrice) / input.legAEntryPrice);
  const adversePct = Number(Math.max(0, -pnlPct).toFixed(6));
  const shouldUnwind = input.elapsedSinceLegAMs > timeoutMs || (input.legBStatus === 'REJECTED' && adversePct > suspendThreshold);

  if (!shouldUnwind) {
    return {
      unwindOrphanLeg: false,
      unwindSide: null,
      unwindReduceOnlyQty: 0,
      adverseExcursionPct: adversePct,
      suspendPairStrategy: false,
      action: 'PENDING_LEG_B',
    };
  }

  const suspend = adversePct > suspendThreshold;
  return {
    unwindOrphanLeg: true,
    unwindSide: input.legAFilledSignedQty > 0 ? 'SELL' : 'BUY',
    unwindReduceOnlyQty: Math.abs(input.legAFilledSignedQty),
    adverseExcursionPct: adversePct,
    suspendPairStrategy: suspend,
    action: suspend ? 'UNWIND_AND_SUSPEND_STRATEGY' : 'UNWIND_ORPHAN_LEG',
  };
}

export function evaluateRebalanceHysteresis(
  targetWeightPct: number,
  currentWeightPct: number,
  consecutiveBreachTicks: number,
  driftBufferPct = 0.15,
  requiredConfirmTicks = 3,
): { shouldRebalance: boolean; nextBreachStreak: number; relativeDriftPct: number } {
  const denom = Math.max(0.01, Math.abs(targetWeightPct));
  const relativeDrift = Math.abs(currentWeightPct - targetWeightPct) / denom;
  if (relativeDrift <= driftBufferPct) {
    return { shouldRebalance: false, nextBreachStreak: 0, relativeDriftPct: Number(relativeDrift.toFixed(4)) };
  }
  const nextStreak = consecutiveBreachTicks + 1;
  return {
    shouldRebalance: nextStreak >= requiredConfirmTicks,
    nextBreachStreak: nextStreak,
    relativeDriftPct: Number(relativeDrift.toFixed(4)),
  };
}

export interface FundingCashflowEntry {
  readonly eventType: 'FUNDING_CASHFLOW';
  readonly intervalIndex: number;
  readonly elapsedHours: number;
  readonly fundingRate: number;
  readonly debitUsd: number;
  readonly postEquityUsd: number;
}

export function simulateFundingFlipCarry(params: {
  initialEquityUsd: number;
  carryNotionalUsd: number;
  fundingRatePer8h: number;
  periods: number;
  maxCumulativeFundingBleedPct: number;
}): {
  readonly cashflows: readonly FundingCashflowEntry[];
  readonly totalDebitUsd: number;
  readonly unwindTriggeredAtHour: number | null;
  readonly mddPct: number;
} {
  let equity = params.initialEquityUsd;
  let activeNotional = params.carryNotionalUsd;
  let totalDebit = 0;
  let unwindHour: number | null = null;
  const cashflows: FundingCashflowEntry[] = [];

  for (let i = 1; i <= params.periods; i += 1) {
    const debit = activeNotional > 0 ? Math.abs(params.fundingRatePer8h) * activeNotional : 0;
    equity -= debit;
    totalDebit += debit;
    const elapsedHours = i * 8;
    cashflows.push({
      eventType: 'FUNDING_CASHFLOW',
      intervalIndex: i,
      elapsedHours,
      fundingRate: params.fundingRatePer8h,
      debitUsd: Number(debit.toFixed(2)),
      postEquityUsd: Number(equity.toFixed(2)),
    });

    const bleedPct = totalDebit / params.initialEquityUsd;
    if (unwindHour === null && bleedPct >= params.maxCumulativeFundingBleedPct) {
      unwindHour = elapsedHours;
      activeNotional = 0;
    }
  }

  const mddPct = ((params.initialEquityUsd - equity) / params.initialEquityUsd) * 100;
  return {
    cashflows,
    totalDebitUsd: Number(totalDebit.toFixed(2)),
    unwindTriggeredAtHour: unwindHour,
    mddPct: Number(mddPct.toFixed(4)),
  };
}
