// IC metric primitives (Phase 3, D4): rolling sign-consistency stability
// and regime-conditioned grouping.
//
// CAUSALITY NOTE (binding): every IC here correlates point-in-time scores
// with FORWARD returns — future data by definition. IC is therefore an
// EVALUATION metric only (how well past scores predicted realized returns);
// it must never be used for signal construction.

import { meanStd } from './ic-metrics-core';

/**
 * IC stability — BINDING definition (D4): rolling-window sign consistency.
 * Over W consecutive VALID IC observations, count trailing windows whose mean
 * shares the sign of the full-sample mean IC; stability = matches/windows.
 * Null when fewer than 2 windows or full-sample mean == 0.
 */
export function signConsistencyStability(
  values: readonly number[],
  window: number,
): number | null {
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`signConsistencyStability: window must be a positive integer, got ${window}`);
  }
  const stats = meanStd(values);
  if (stats === null || stats.mean === 0) return null;
  const windowCount = values.length - window + 1;
  if (windowCount < 2) return null;
  let matches = 0;
  for (let start = 0; start < windowCount; start++) {
    let sum = 0;
    for (let k = start; k < start + window; k++) sum += values[k];
    const windowMean = sum / window;
    if ((windowMean > 0 && stats.mean > 0) || (windowMean < 0 && stats.mean < 0)) matches += 1;
  }
  return matches / windowCount;
}

/** Per-regime IC summary: mean + count for each observed label. */
export interface RegimeIcSummary {
  readonly label: string;
  readonly icMean: number;
  readonly count: number;
}

/**
 * Group valid IC observations by injected regime labels (regime-breakdown
 * pattern: labels arrive precomputed, keyed by timestamp; this module never
 * computes regimes itself). Unlabeled timestamps are skipped. Length
 * mismatch throws (fail-closed).
 */
export function regimeIcBreakdown(
  timestamps: readonly number[],
  icValues: readonly (number | null)[],
  labels: Readonly<Record<number, string>>,
): RegimeIcSummary[] {
  if (timestamps.length !== icValues.length) {
    throw new Error(
      `regimeIcBreakdown: timestamps.length (${timestamps.length}) !== icValues.length (${icValues.length})`,
    );
  }
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < timestamps.length; i++) {
    const ic = icValues[i];
    if (ic === null) continue;
    const label = labels[timestamps[i]];
    if (label === undefined) continue;
    const bucket = buckets.get(label);
    if (bucket === undefined) buckets.set(label, [ic]);
    else bucket.push(ic);
  }
  return [...buckets.entries()]
    .map(([label, values]) => ({
      label,
      // Buckets are only ever created by pushing a value, so never empty.
      icMean: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
