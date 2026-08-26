// Quantile helpers for IC analysis (Phase 3, D4). Pure, deterministic.
//
// Quantile spread and turnover are GROSS of costs and are RESEARCH METRICS
// ONLY — they measure score-to-forward-return separation, never trade
// performance. Turnover here reuses cross-sectional computeTurnover verbatim
// (one-sided ½Σ|Δw|, missing symbols weight 0).

import { computeTurnover } from '@/tree/alpha/cross-sectional/turnover';

import { pearson, spearman } from './ic-metrics';
import type { IcPoint, QuantileSpreadPoint } from './ic-analysis';

/** One finite score/forward-return pair at a rebalance date. */
export interface ScorePair {
  readonly symbol: string;
  readonly score: number;
  readonly fwd: number;
}

/**
 * Long-leg equal weights: top bucket (score desc, symbol asc tie-break).
 * Equal-count buckets, deterministic. Empty input → empty weights.
 */
export function topBucketWeights(
  entries: readonly ScorePair[],
  quantiles: number,
): Record<string, number> {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const size = Math.floor(sorted.length / quantiles);
  const weights: Record<string, number> = {};
  for (let i = 0; i < size; i++) weights[sorted[i]!.symbol] = 1 / size;
  return weights;
}

/**
 * Mean forward return of one quantile leg. Top leg = score desc, bottom leg =
 * score asc; ties broken by symbol asc (deterministic). Null when the bucket
 * is empty (size 0).
 */
export function legForwardMean(
  pairs: readonly ScorePair[],
  quantiles: number,
  leg: 'top' | 'bottom',
): number | null {
  const sorted = [...pairs].sort((a, b) =>
    leg === 'top'
      ? b.score - a.score || a.symbol.localeCompare(b.symbol)
      : a.score - b.score || a.symbol.localeCompare(b.symbol),
  );
  const size = Math.floor(sorted.length / quantiles);
  if (size === 0) return null;
  let sum = 0;
  for (let i = 0; i < size; i++) sum += sorted[i]!.fwd;
  return sum / size;
}

/** One rebalance date's IC point + gross quantile spread. */
export function rebalancePoint(
  timestamp: number,
  pairs: readonly ScorePair[],
  minSymbols: number,
  quantiles: number,
): { point: IcPoint; spread: QuantileSpreadPoint } {
  const sufficient = pairs.length >= minSymbols;
  const xs = pairs.map((p) => p.score);
  const ys = pairs.map((p) => p.fwd);
  const topFwd = legForwardMean(pairs, quantiles, 'top');
  const bottomFwd = legForwardMean(pairs, quantiles, 'bottom');
  return {
    point: {
      timestamp,
      ic: sufficient ? pearson(xs, ys) : null,
      rankIc: sufficient ? spearman(xs, ys) : null,
      validSymbols: pairs.length,
    },
    spread: {
      timestamp,
      spread: topFwd === null || bottomFwd === null ? null : topFwd - bottomFwd,
    },
  };
}

/** One-sided long-leg turnover between consecutive rebalance weights. */
export function turnoverSeries(
  weights: ReadonlyArray<Record<string, number>>,
): number[] {
  const out: number[] = [];
  let prev: Record<string, number> = {};
  for (const next of weights) {
    out.push(computeTurnover(prev, next));
    prev = next;
  }
  return out;
}