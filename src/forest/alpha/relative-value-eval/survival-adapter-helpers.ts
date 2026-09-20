// Statistical and regime bucket helper functions for relative-value survival evaluation.
// Pure and deterministic — no I/O, no network.

import { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';

/** Equity curve compounded from per-period net returns, anchored at 1.0. */
export function equityCurve(netReturns: readonly number[]): number[] {
  const curve = [1];
  let equity = 1;
  for (const r of netReturns) {
    equity *= 1 + r;
    curve.push(equity);
  }
  return curve;
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Full-label regime map carrying a single observed-span UNKNOWN bucket.
 * RV sims have no per-period causal regime labels at this seam; regime
 * detail lives on RelativeValueReport.regimeBreakdown instead. */
export function singleRegimeBucket(
  partial: Partial<EvaluationReport>,
): Record<RegimeLabel, Partial<EvaluationReport>> {
  const buckets = {} as Record<RegimeLabel, Partial<EvaluationReport>>;
  buckets[RegimeLabel.UNKNOWN] = partial;
  return buckets;
}
