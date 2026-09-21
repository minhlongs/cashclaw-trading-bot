import type { RankedAsset } from './types';

/**
 * Market-neutral weights from a ranking: top half long (+1/half), bottom half
 * short (-1/half). The middle asset of an odd-sized ranking is excluded so the
 * weights sum to 0.
 */
export function marketNeutralWeights(assets: readonly RankedAsset[]): Record<string, number> {
  const sorted = [...assets].sort((a, b) => a.rank - b.rank);
  const n = sorted.length;
  if (n === 0) return {};

  const half = Math.floor(n / 2);
  const weights: Record<string, number> = {};

  for (let i = 0; i < half; i++) {
    weights[sorted[i].symbol] = 1 / half;
  }
  for (let i = n - half; i < n; i++) {
    weights[sorted[i].symbol] = -1 / half;
  }
  return weights;
}

/**
 * Zero the intra-basket net weight by subtracting the mean weight from every
 * position. Output weights always sum to 0.
 */
export function basketNeutralize(weights: Record<string, number>): Record<string, number> {
  const symbols = Object.keys(weights);
  if (symbols.length === 0) return {};

  let sum = 0;
  for (const s of symbols) sum += weights[s];
  const mean = sum / symbols.length;

  const out: Record<string, number> = {};
  for (const s of symbols) {
    out[s] = weights[s] - mean;
  }
  return out;
}
