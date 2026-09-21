import { LongShortSelection, RankedAsset } from './types';

/** Sort comparator: score descending, symbol ascending as deterministic tiebreak. */
function byScoreThenSymbol(
  a: { symbol: string; score: number },
  b: { symbol: string; score: number },
): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

/**
 * Rank assets by score descending.
 * Ties are broken deterministically by symbol (ascending). Rank is 1-based;
 * percentile is 0 for the top asset and 1 for the bottom asset.
 */
export function rankAssets(scores: Record<string, number>): RankedAsset[] {
  const entries = Object.keys(scores).map((symbol) => ({
    symbol,
    score: scores[symbol],
  }));
  entries.sort(byScoreThenSymbol);

  const n = entries.length;
  if (n === 0) return [];

  return entries.map((entry, i) => {
    const rank = i + 1;
    const percentile = n === 1 ? 0 : (rank - 1) / (n - 1);
    return {
      symbol: entry.symbol,
      score: entry.score,
      rank,
      percentile,
    };
  });
}

/**
 * Min-max normalize values into [0, 1].
 * Empty input returns []. When all values are equal, returns 0 for every element.
 */
export function percentileNormalize(values: readonly number[]): number[] {
  if (values.length === 0) return [];

  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }

  const range = max - min;
  if (range === 0) {
    return values.map(() => 0);
  }
  return values.map((v) => (v - min) / range);
}

/**
 * Select top N by rank as longs and bottom N as shorts.
 * Throws when topN/bottomN is negative or exceeds the asset count.
 */
export function selectLongShort(
  assets: readonly RankedAsset[],
  topN: number,
  bottomN: number,
): LongShortSelection {
  if (!Number.isInteger(topN) || topN < 0) {
    throw new Error('selectLongShort: topN must be a non-negative integer');
  }
  if (!Number.isInteger(bottomN) || bottomN < 0) {
    throw new Error('selectLongShort: bottomN must be a non-negative integer');
  }
  if (topN > assets.length) {
    throw new Error(`selectLongShort: topN ${topN} exceeds asset count ${assets.length}`);
  }
  if (bottomN > assets.length) {
    throw new Error(`selectLongShort: bottomN ${bottomN} exceeds asset count ${assets.length}`);
  }

  const sorted = [...assets].sort((a, b) => a.rank - b.rank);
  const long = sorted.slice(0, topN).map((a) => a.symbol);
  const short = sorted.slice(assets.length - bottomN).map((a) => a.symbol);
  return { long, short };
}
