// Multiple-Testing Defense — Overfitting Proxies
// Two deterministic, sampling-free proxies for backtest overfitting
// (mission §9):
// 1. `pboProxy` — CSCV-style rank proxy: rank configs by in-sample mean
//    across OOS windows, report the fraction of IS-best configs that
//    finish below the median OOS performance.
// 2. `parameterSensitivity` — metric spread across neighboring configs
//    in a parameter grid; unstable metrics indicate curve fitting.
// Pure and deterministic: no I/O, no randomness, no Node APIs.

import type {
  GridResult,
  ParameterSensitivityOptions,
  ParameterSensitivityResult,
  PboProxyResult,
} from './overfitting-types';

/** Default normalized-spread ceiling for `parameterSensitivity`. */
export const DEFAULT_MAX_NORMALIZED_SPREAD = 0.5;

function validateMatrix(configMatrix: readonly (readonly number[])[]): void {
  if (configMatrix.length < 2) {
    throw new Error(
      `pboProxy requires at least 2 configurations, got ${configMatrix.length}`,
    );
  }
  const windows = configMatrix[0].length;
  if (windows < 2) {
    throw new Error(`pboProxy requires at least 2 OOS windows, got ${windows}`);
  }
  for (const row of configMatrix) {
    if (row.length !== windows) {
      throw new Error('pboProxy requires a rectangular config x window matrix');
    }
    for (const value of row) {
      if (!Number.isFinite(value)) {
        throw new Error('pboProxy matrix contains a non-finite value');
      }
    }
  }
}

/** Median of a numeric array (input is not mutated). */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * CSCV-style probability-of-backtest-overfitting proxy.
 *
 * Rows = configurations, columns = OOS windows. Each config is ranked
 * in-sample by its mean across windows (ties broken by lowest row index —
 * deterministic). The proxy reports the fraction of the IS-best half of
 * configs whose OOS performance (final window) finishes below the median
 * final-window performance of all configs. A high value means in-sample
 * ranking does not survive out-of-sample.
 */
export function pboProxy(
  configMatrix: readonly (readonly number[])[],
): PboProxyResult {
  validateMatrix(configMatrix);
  const configs = configMatrix.length;
  const windows = configMatrix[0].length;

  const ranked = configMatrix
    .map((row, index) => ({
      index,
      isMean: row.reduce((sum, v) => sum + v, 0) / windows,
      oosFinal: row[windows - 1],
    }))
    .sort((a, b) => b.isMean - a.isMean || a.index - b.index);

  const topHalfSize = Math.max(Math.floor(configs / 2), 1);
  const topHalf = ranked.slice(0, topHalfSize);
  const median = medianOf(configMatrix.map((row) => row[windows - 1]));
  const belowMedian = topHalf.filter((c) => c.oosFinal < median).length;

  return {
    pbo: belowMedian / topHalfSize,
    configs,
    windows,
  };
}

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
