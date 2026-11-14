// Gate G10: Pure Integer Micro-Unit Double-Entry Accounting Math.

import { ok, err, type Result } from '@/lib/result';
import {
  BASE_UNITS_PER_ASSET,
  BPS_SCALE,
  ZERO_BIGINT,
  type ApplyLedgerFillInput,
  type JournalLeg,
  type LedgerAccountBalances,
  type LedgerBalanceSheet,
  type LedgerPositionRecord,
} from './ledger-types';

export function absBigInt(value: bigint): bigint {
  return value < ZERO_BIGINT ? -value : value;
}

export function createZeroAccountBalances(): LedgerAccountBalances {
  return {
    CASH_AVAILABLE: ZERO_BIGINT,
    MARGIN_RESERVED: ZERO_BIGINT,
    POSITION_MARGIN: ZERO_BIGINT,
    REALIZED_PNL: ZERO_BIGINT,
    FEES_EXPENSE: ZERO_BIGINT,
    FUNDING_NET: ZERO_BIGINT,
    INITIAL_CAPITAL: ZERO_BIGINT,
  };
}

export function computeNotionalMicroUsd(qtyBase: bigint, priceMicroUsd: bigint): bigint {
  return (qtyBase * priceMicroUsd) / BASE_UNITS_PER_ASSET;
}

export function computeRequiredMarginMicroUsd(
  qtyBase: bigint,
  priceMicroUsd: bigint,
  marginRateBps: bigint = BPS_SCALE,
): bigint {
  return (qtyBase * priceMicroUsd * marginRateBps) / (BASE_UNITS_PER_ASSET * BPS_SCALE);
}

export function validateBalancedLegs(legs: readonly JournalLeg[]): Result<bigint> {
  if (legs.length === 0) {
    return err('UNBALANCED_JOURNAL_ENTRY: journal entry must contain at least two legs');
  }
  let debitSum = ZERO_BIGINT;
  let creditSum = ZERO_BIGINT;
  for (const leg of legs) {
    if (leg.amountMicroUsd <= ZERO_BIGINT) {
      return err(`UNBALANCED_JOURNAL_ENTRY: leg amount must be positive for ${leg.account}`);
    }
    if (leg.direction === 'DEBIT') {
      debitSum += leg.amountMicroUsd;
    } else {
      creditSum += leg.amountMicroUsd;
    }
  }
  if (debitSum !== creditSum) {
    return err(
      `UNBALANCED_JOURNAL_ENTRY: sum(debits)=${debitSum.toString()} !== sum(credits)=${creditSum.toString()}`,
    );
  }
  return ok(debitSum);
}

export function applyLegsToBalances(
  current: LedgerAccountBalances,
  legs: readonly JournalLeg[],
): LedgerAccountBalances {
  const next = { ...current };
  for (const leg of legs) {
    const sign = leg.direction === 'DEBIT' ? BigInt(1) : BigInt(-1);
    if (
      leg.account === 'CASH_AVAILABLE' ||
      leg.account === 'MARGIN_RESERVED' ||
      leg.account === 'POSITION_MARGIN' ||
      leg.account === 'FEES_EXPENSE'
    ) {
      next[leg.account] = next[leg.account] + sign * leg.amountMicroUsd;
    } else {
      next[leg.account] = next[leg.account] - sign * leg.amountMicroUsd;
    }
  }
  return next;
}

export function computeBalanceSheet(balances: LedgerAccountBalances): LedgerBalanceSheet {
  const assetsMicroUsd =
    balances.CASH_AVAILABLE + balances.MARGIN_RESERVED + balances.POSITION_MARGIN;
  const liabilitiesMicroUsd = ZERO_BIGINT;
  const equityMicroUsd =
    balances.INITIAL_CAPITAL +
    balances.REALIZED_PNL +
    balances.FUNDING_NET -
    balances.FEES_EXPENSE;
  const discrepancyMicroUsd = assetsMicroUsd - (liabilitiesMicroUsd + equityMicroUsd);
  return {
    assetsMicroUsd,
    liabilitiesMicroUsd,
    equityMicroUsd,
    discrepancyMicroUsd,
    balanced: discrepancyMicroUsd === ZERO_BIGINT,
  };
}

function appendPair(
  legs: JournalLeg[],
  debitAccount: JournalLeg['account'],
  creditAccount: JournalLeg['account'],
  amount: bigint,
): void {
  if (amount > ZERO_BIGINT) {
    legs.push({ account: debitAccount, direction: 'DEBIT', amountMicroUsd: amount });
    legs.push({ account: creditAccount, direction: 'CREDIT', amountMicroUsd: amount });
  }
}

export interface FillTransitionPlan {
  readonly nextPosition: LedgerPositionRecord;
  readonly legs: readonly JournalLeg[];
  readonly realizedPnlDeltaMicroUsd: bigint;
}

function computeCloseMetrics(
  existing: LedgerPositionRecord,
  closeQtyBase: bigint,
  fillPriceMicroUsd: bigint,
): { closedBasis: bigint; releasedPosMargin: bigint; realizedPnl: bigint } {
  if (closeQtyBase === ZERO_BIGINT) {
    return { closedBasis: ZERO_BIGINT, releasedPosMargin: ZERO_BIGINT, realizedPnl: ZERO_BIGINT };
  }
  const absExisting = absBigInt(existing.signedQtyBase);
  const fullClose = closeQtyBase === absExisting;
  const closedBasis = fullClose
    ? existing.openNotionalMicroUsd
    : (existing.openNotionalMicroUsd * closeQtyBase) / absExisting;
  const releasedPosMargin = fullClose
    ? existing.openMarginMicroUsd
    : (existing.openMarginMicroUsd * closeQtyBase) / absExisting;
  const exitNotional = computeNotionalMicroUsd(closeQtyBase, fillPriceMicroUsd);
  const realizedPnl =
    existing.signedQtyBase > ZERO_BIGINT ? exitNotional - closedBasis : closedBasis - exitNotional;
  return { closedBasis, releasedPosMargin, realizedPnl };
}

export function buildFillTransitionPlan(
  existing: LedgerPositionRecord,
  input: ApplyLedgerFillInput,
): FillTransitionPlan {
  const signedDelta = input.side === 'buy' ? input.fillQtyBase : -input.fillQtyBase;
  const oppositeDirection =
    (existing.signedQtyBase > ZERO_BIGINT && signedDelta < ZERO_BIGINT) ||
    (existing.signedQtyBase < ZERO_BIGINT && signedDelta > ZERO_BIGINT);
  const absExisting = absBigInt(existing.signedQtyBase);
  const closeQtyBase = oppositeDirection
    ? input.fillQtyBase < absExisting
      ? input.fillQtyBase
      : absExisting
    : ZERO_BIGINT;
  const openQtyBase = input.fillQtyBase - closeQtyBase;

  const { closedBasis, releasedPosMargin, realizedPnl } = computeCloseMetrics(
    existing,
    closeQtyBase,
    input.fillPriceMicroUsd,
  );
  const marginRateBps = input.marginRateBps ?? BPS_SCALE;
  const addedNotional = computeNotionalMicroUsd(openQtyBase, input.fillPriceMicroUsd);
  const addedMargin = computeRequiredMarginMicroUsd(openQtyBase, input.fillPriceMicroUsd, marginRateBps);

  const legs: JournalLeg[] = [];
  appendPair(legs, 'CASH_AVAILABLE', 'MARGIN_RESERVED', input.releasedOrderMarginMicroUsd);
  appendPair(legs, 'CASH_AVAILABLE', 'POSITION_MARGIN', releasedPosMargin);
  if (realizedPnl > ZERO_BIGINT) {
    appendPair(legs, 'CASH_AVAILABLE', 'REALIZED_PNL', realizedPnl);
  } else if (realizedPnl < ZERO_BIGINT) {
    appendPair(legs, 'REALIZED_PNL', 'CASH_AVAILABLE', -realizedPnl);
  }
  appendPair(legs, 'POSITION_MARGIN', 'CASH_AVAILABLE', addedMargin);
  appendPair(legs, 'FEES_EXPENSE', 'CASH_AVAILABLE', input.feeMicroUsd);

  return {
    nextPosition: {
      symbol: input.symbol,
      signedQtyBase: existing.signedQtyBase + signedDelta,
      openNotionalMicroUsd: existing.openNotionalMicroUsd - closedBasis + addedNotional,
      openMarginMicroUsd: existing.openMarginMicroUsd - releasedPosMargin + addedMargin,
    },
    legs,
    realizedPnlDeltaMicroUsd: realizedPnl,
  };
}
