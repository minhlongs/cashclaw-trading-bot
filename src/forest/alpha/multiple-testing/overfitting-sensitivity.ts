// Multiple-Testing Defense — Parameter Sensitivity.
// Metric spread across neighboring configs in a parameter grid;
// unstable metrics indicate curve fitting.

import type {
  GridResult,
  ParameterSensitivityOptions,
  ParameterSensitivityResult,
} from './overfitting-types';

/** Default normalized-spread ceiling for `parameterSensitivity`. */
export const DEFAULT_MAX_NORMALIZED_SPREAD = 0.5;

/** Chebyshev (max coordinate) distance between two parameter vectors. */
function paramDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error('parameterSensitivity requires uniform param dimensions');
  }
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Parameter sensitivity across a configuration grid.
 *
 * Two configs are "neighbors" when they differ in exactly one parameter
 * coordinate. `maxDelta` is the largest metric delta between neighbors;
 * `normalizedSpread` scales it by the full metric range. The strategy is
 * `sensitive` when the normalized spread exceeds the ceiling (default
 * 0.5) — small parameter moves producing large metric swings is a
 * curve-fitting signature.
 *
 * Fail-closed: fewer than 2 results throws.
 */
export function parameterSensitivity(
  gridResults: readonly GridResult[],
  options: ParameterSensitivityOptions = {},
): ParameterSensitivityResult {
  if (gridResults.length < 2) {
    throw new Error(
      `parameterSensitivity requires at least 2 grid results, got ${gridResults.length}`,
    );
  }
  const ceiling = options.maxNormalizedSpread ?? DEFAULT_MAX_NORMALIZED_SPREAD;
  if (!Number.isFinite(ceiling) || ceiling < 0) {
    throw new Error(
      `maxNormalizedSpread must be finite and >= 0, got ${ceiling}`,
    );
  }
  for (const result of gridResults) {
    if (!Number.isFinite(result.metric)) {
      throw new Error('parameterSensitivity grid contains a non-finite metric');
    }
  }

  let maxDelta = 0;
  for (let i = 0; i < gridResults.length; i++) {
    for (let j = i + 1; j < gridResults.length; j++) {
      if (paramDistance(gridResults[i].params, gridResults[j].params) <= 1) {
        const delta = Math.abs(gridResults[i].metric - gridResults[j].metric);
        if (delta > maxDelta) maxDelta = delta;
      }
    }
  }

  const metrics = gridResults.map((r) => r.metric);
  const range = Math.max(...metrics) - Math.min(...metrics);
  const normalizedSpread = range > 0 ? maxDelta / range : 0;

  return {
    maxDelta,
    normalizedSpread,
    sensitive: normalizedSpread > ceiling,
  };
}
