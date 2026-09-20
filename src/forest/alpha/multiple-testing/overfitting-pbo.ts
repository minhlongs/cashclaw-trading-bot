// Multiple-Testing Defense — Probability of Backtest Overfitting (PBO) proxy.
// CSCV-style rank proxy: rank configs by in-sample mean across OOS windows,
// report the fraction of IS-best configs that finish below the median OOS
// performance.

import type { PboProxyResult } from './overfitting-types';

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
