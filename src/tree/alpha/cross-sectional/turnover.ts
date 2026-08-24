// Turnover math for cross-sectional rebalancing.
// Pure, deterministic — no I/O, no network, no Node APIs.
//
// Convention: ONE-SIDED turnover = 0.5 · Σ|w_next − w_prev|.
// Under this convention a full rotation of the book (e.g. 100% asset A
// replaced by 100% asset B) equals turnover 1.0, and entering a gross-1
// book from cash equals 0.5. Symbols absent from one side count as 0.

import type { RebalanceRecord } from './types';

/**
 * One-sided turnover between two weight vectors.
 * Symbols missing from either side are treated as weight 0.
 */
export function computeTurnover(
  prevWeights: Readonly<Record<string, number>>,
  nextWeights: Readonly<Record<string, number>>,
): number {
  const symbols = new Set<string>([
    ...Object.keys(prevWeights),
    ...Object.keys(nextWeights),
  ]);

  let sumAbsDelta = 0;
  for (const symbol of symbols) {
    const prev = prevWeights[symbol] ?? 0;
    const next = nextWeights[symbol] ?? 0;
    sumAbsDelta += Math.abs(next - prev);
  }
  return 0.5 * sumAbsDelta;
}

/** Total turnover across a sequence of rebalance records. */
export function sumTurnover(records: readonly Pick<RebalanceRecord, 'turnover'>[]): number {
  let total = 0;
  for (const record of records) {
    total += record.turnover;
  }
  return total;
}
