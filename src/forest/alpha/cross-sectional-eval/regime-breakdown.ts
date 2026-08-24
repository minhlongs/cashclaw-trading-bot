// Regime-breakdown helper for cross-sectional evaluation (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
// CRITICAL: Does NOT import RuleBasedRegimeClassifier. Regime labels are
// precomputed and timestamp-aligned by the caller (injected dependency).
//
// Per-regime sub-reports contain: netReturn, annualizedSharpe, turnoverTotal.
// Annualization uses the periodsPerYear passed by the caller.

import type { RegimeLabel } from '@/tree/regime/types';
import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';
import { annualizedSharpe, compoundReturn } from './return-metrics';

export interface RegimeSubReport {
  readonly netReturn: number;
  readonly annualizedSharpe: number | null;
  readonly turnoverTotal: number;
}

/**
 * Group rebalance periods by injected regime labels and compute per-regime
 * metrics. The label array MUST have the same length as `periods` (each
 * period gets exactly one label). Mismatch throws (fail-closed).
 *
 * @param periods Simulator output records (one per rebalance).
 * @param regimeLabels Timestamp-aligned labels from caller; length === periods.length.
 * @param periodsPerYear Periods per year for annualized Sharpe.
 * @returns Record with keys = all RegimeLabel enum values; unobserved regimes
 *          get { netReturn: 0, annualizedSharpe: null, turnoverTotal: 0 }.
 */
export function breakdownByRegime(
  periods: readonly RebalanceRecord[],
  regimeLabels: readonly RegimeLabel[],
  periodsPerYear: number,
): Record<RegimeLabel, RegimeSubReport> {
  if (periods.length !== regimeLabels.length) {
    throw new Error(
      `breakdownByRegime: periods.length (${periods.length}) !== regimeLabels.length (${regimeLabels.length})`,
    );
  }

  const buckets: Record<RegimeLabel, { netReturns: number[]; turnovers: number[] }> = {
    TREND_UP: { netReturns: [], turnovers: [] },
    TREND_DOWN: { netReturns: [], turnovers: [] },
    RANGE: { netReturns: [], turnovers: [] },
    HIGH_VOLATILITY: { netReturns: [], turnovers: [] },
    LOW_VOLATILITY: { netReturns: [], turnovers: [] },
    SHOCK: { netReturns: [], turnovers: [] },
    UNKNOWN: { netReturns: [], turnovers: [] },
  };

  for (let i = 0; i < periods.length; i++) {
    const label = regimeLabels[i];
    buckets[label].netReturns.push(periods[i].netReturn);
    buckets[label].turnovers.push(periods[i].turnover);
  }

  const out: Record<RegimeLabel, RegimeSubReport> = {} as Record<RegimeLabel, RegimeSubReport>;
  for (const label of Object.keys(buckets) as RegimeLabel[]) {
    const { netReturns, turnovers } = buckets[label];
    if (netReturns.length === 0) {
      out[label] = { netReturn: 0, annualizedSharpe: null, turnoverTotal: 0 };
      continue;
    }
    const netReturn = compoundReturn(netReturns);
    const sharpe = annualizedSharpe(netReturns, periodsPerYear);
    const turnoverTotal = turnovers.reduce((a, b) => a + b, 0);
    out[label] = { netReturn, annualizedSharpe: sharpe, turnoverTotal };
  }
  return out;
}