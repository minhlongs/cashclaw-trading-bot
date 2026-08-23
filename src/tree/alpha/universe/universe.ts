// Cross-sectional universe math (mission §3C).
// Pure, deterministic — no I/O, no network, no Node APIs, no Math.random/Date.now.

import {
  LongShortSelection,
  RankedAsset,
  RebalanceRule,
  Universe,
  Weighting,
  VALID_REBALANCE_RULES,
  VALID_WEIGHTINGS,
} from './types';

// ── Universe construction ─────────────────────────────────────────────────────

/**
 * Build an immutable universe from a symbol set.
 * Throws on empty input, duplicate symbols, or unknown enum values.
 */
export function createUniverse(
  id: string,
  symbols: readonly string[],
  weighting: Weighting = 'equal',
  rebalanceRule: RebalanceRule = 'daily',
): Universe {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('createUniverse: id must be a non-empty string');
  }
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('createUniverse: symbols must be a non-empty array');
  }
  if (!VALID_WEIGHTINGS.includes(weighting)) {
    throw new Error(`createUniverse: invalid weighting '${weighting}'`);
  }
  if (!VALID_REBALANCE_RULES.includes(rebalanceRule)) {
    throw new Error(`createUniverse: invalid rebalanceRule '${rebalanceRule}'`);
  }

  const normalized = symbols
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter((s): s is string => typeof s === 'string' && s !== '');

  if (normalized.length === 0) {
    throw new Error('createUniverse: symbols must contain at least one non-empty string');
  }

  const seen = new Set<string>();
  for (const s of normalized) {
    if (seen.has(s)) {
      throw new Error(`createUniverse: duplicate symbol '${s}'`);
    }
    seen.add(s);
  }

  return {
    id: id.trim(),
    symbols: Object.freeze(normalized),
    weighting,
    rebalanceRule,
  };
}

// ── Ranking ───────────────────────────────────────────────────────────────────

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

// ── Normalization ─────────────────────────────────────────────────────────────

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

// ── Long/short selection ──────────────────────────────────────────────────────

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

// ── Neutralization ────────────────────────────────────────────────────────────

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
