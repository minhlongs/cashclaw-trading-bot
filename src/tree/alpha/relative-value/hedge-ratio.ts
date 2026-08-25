// Causal rolling hedge-ratio estimator for pair spreads.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: the estimate at `asOfTime` consumes only panel closes
// whose timestamp is STRICTLY BEFORE `asOfTime` (same strictly-before
// slicing as estimateRollingBetas, cross-sectional/beta-sizing.ts). The
// trailing `window` of those aligned (closeB, closeA) pairs feeds a single
// OLS regression of B on A via computeFactorExposure.
//
// Fail-closed: every degenerate input returns null + a distinct reason.
// Never a silent β = 1, never a carried-forward stale estimate.

import { computeFactorExposure } from '@/tree/alpha/factors/analysis';
import type { PairPanel } from './types';

/** computeFactorExposure returns a degenerate 0 below 3 observations. */
const OLS_MIN_OBS = 3;
const DEFAULT_EPSILON = 1e-9;

/** Successful hedge-ratio estimate with its OLS t-statistic. */
export interface HedgeRatioEstimate {
  readonly hedgeRatio: number;
  readonly tStat: number;
}

/** Fail-closed outcome with a distinct, machine-checkable reason. */
export interface HedgeRatioFailure {
  readonly hedgeRatio: null;
  readonly reason: string;
}

export type HedgeRatioResult = HedgeRatioEstimate | HedgeRatioFailure;

/** Distinct fail-closed reasons (tested verbatim). */
export const HEDGE_RATIO_REASONS = {
  insufficientObservations: 'insufficient observations',
  flatLegA: 'legA close variance is zero in window',
  nonFiniteExposure: 'OLS exposure is non-finite',
  degenerateBeta: 'hedge ratio magnitude below epsilon',
  nonPositiveBeta: 'hedge ratio is non-positive',
} as const;

/** Trailing `window` aligned (closeB, closeA) pairs with timestamp < asOf. */
function alignedCloses(
  panel: PairPanel,
  window: number,
  asOfTime: number,
): { a: number[]; b: number[] } {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < panel.timestamps.length; i++) {
    if (panel.timestamps[i]! >= asOfTime) continue;
    a.push(panel.closesA[i]!);
    b.push(panel.closesB[i]!);
  }
  const start = Math.max(0, a.length - window);
  return { a: a.slice(start), b: b.slice(start) };
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

/**
 * Rolling OLS hedge ratio β regressing legB on legA, using only closes with
 * timestamp STRICTLY BEFORE `asOfTime`. Returns null + reason when:
 * fewer than max(minObs, 3) aligned observations exist, the legA slice has
 * zero variance, the exposure is non-finite, |β| < epsilon, or β ≤ 0
 * (a non-positive hedge ratio is degenerate for spread construction and is
 * flagged, never silently used).
 */
export function estimateRollingHedgeRatio(
  panel: PairPanel,
  window: number,
  minObs: number,
  asOfTime: number,
  epsilon: number = DEFAULT_EPSILON,
): HedgeRatioResult {
  if (!Number.isInteger(window) || window <= 0) {
    throw new Error('estimateRollingHedgeRatio: window must be a positive integer');
  }
  if (!Number.isInteger(minObs) || minObs <= 0) {
    throw new Error('estimateRollingHedgeRatio: minObs must be a positive integer');
  }
  if (Number.isNaN(asOfTime)) {
    throw new Error('estimateRollingHedgeRatio: asOfTime must not be NaN');
  }
  if (
    panel.timestamps.length !== panel.closesA.length ||
    panel.timestamps.length !== panel.closesB.length
  ) {
    throw new Error('estimateRollingHedgeRatio: panel array lengths differ');
  }

  const { a, b } = alignedCloses(panel, window, asOfTime);
  const required = Math.max(minObs, OLS_MIN_OBS);
  if (a.length < required) {
    return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.insufficientObservations };
  }
  if (variance(a) === 0) {
    return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.flatLegA };
  }

  const exposure = computeFactorExposure(b, a, 'hedge');
  const beta = exposure.exposure;
  if (!Number.isFinite(beta)) {
    return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.nonFiniteExposure };
  }
  if (Math.abs(beta) < epsilon) {
    return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.degenerateBeta };
  }
  if (beta <= 0) {
    return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.nonPositiveBeta };
  }
  return { hedgeRatio: beta, tStat: exposure.tStat };
}
