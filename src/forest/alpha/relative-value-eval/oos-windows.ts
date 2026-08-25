// Shared stitched-OOS window analysis for ablation + robustness.
// Pure and deterministic — no I/O, no network, no randomness.

import type { RVWalkForwardResult } from './walk-forward';

/** Per-window aggregates over the stitched OOS periods. */
export interface WindowBucketStats {
  /** Mean net return per window (0 when the window traded nothing). */
  readonly means: readonly number[];
  /** OOS period count per window (0 = traded nothing). */
  readonly counts: readonly number[];
}

/**
 * Assign each stitched OOS period to its owning window — the LATEST window
 * whose testStartTime <= period timestamp (same convention as the survival
 * shim). Fails closed on empty windows, non-monotonic test starts, or
 * periods preceding every window.
 */
export function bucketWindowStats(rv: RVWalkForwardResult): WindowBucketStats {
  if (rv.windows.length === 0) {
    throw new Error('bucketWindowStats: walk-forward result has no windows');
  }
  const starts = rv.windows.map((w) => w.bounds.testStartTime);
  for (let i = 1; i < starts.length; i++) {
    if (starts[i]! <= starts[i - 1]!) {
      throw new Error(
        'bucketWindowStats: window test start times must strictly increase',
      );
    }
  }
  const sums = rv.windows.map(() => 0);
  const counts = rv.windows.map(() => 0);
  let current = 0;
  // Periods arrive chronologically (driver stable-sorts by timestamp).
  for (const period of rv.stitched.roundTripsSource) {
    while (current + 1 < starts.length && period.timestamp >= starts[current + 1]!) {
      current++;
    }
    if (period.timestamp < starts[current]!) {
      throw new Error(
        `bucketWindowStats: OOS period ${period.timestamp} precedes every window test start`,
      );
    }
    sums[current]! += period.netReturn;
    counts[current]! += 1;
  }
  return {
    means: sums.map((sum, i) => (counts[i]! > 0 ? sum / counts[i]! : 0)),
    counts,
  };
}

/** Overall stitched OOS expectancy: mean net return across ALL periods. */
export function oosExpectancy(rv: RVWalkForwardResult): number {
  const returns = rv.stitched.netReturns;
  if (returns.length === 0) return 0;
  return returns.reduce((sum, r) => sum + r, 0) / returns.length;
}
