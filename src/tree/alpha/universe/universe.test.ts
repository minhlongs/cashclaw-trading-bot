import { describe, it, expect } from 'vitest';
import {
  createUniverse,
  rankAssets,
  percentileNormalize,
  selectLongShort,
  marketNeutralWeights,
  basketNeutralize,
} from './universe';
import type { RankedAsset } from './types';

// Deterministic fixtures (seeded-PRNG style: same params → same output).
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'] as const;

/** Deterministic score map — no randomness, identical output on every call. */
function makeScores(n: number, seed = 7): Record<string, number> {
  const scores: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    scores[`SYM${String(i).padStart(2, '0')}`] =
      Math.sin(i * 1.3 + seed) + Math.cos(i * 0.7 + seed) * 0.5;
  }
  return scores;
}

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((s, w) => s + w, 0);
}

const EPSILON = 1e-9;

describe('createUniverse', () => {
  it('creates a universe with defaults', () => {
    const u = createUniverse('crypto-top', SYMBOLS);
    expect(u.id).toBe('crypto-top');
    expect(u.symbols).toEqual([...SYMBOLS]);
    expect(u.weighting).toBe('equal');
    expect(u.rebalanceRule).toBe('daily');
  });

  it('rejects empty/duplicate symbols, empty id, and bad enums', () => {
    expect(() => createUniverse('u', [])).toThrow('non-empty');
    expect(() => createUniverse('u', ['BTC', 'ETH', 'BTC'])).toThrow('duplicate');
    expect(() => createUniverse('  ', SYMBOLS)).toThrow('id');
    expect(() => createUniverse('u', SYMBOLS, 'bogus' as never)).toThrow('weighting');
    expect(() => createUniverse('u', SYMBOLS, 'equal', 'bogus' as never)).toThrow('rebalanceRule');
  });

  it('freezes the symbols array (immutability)', () => {
    const u = createUniverse('u', SYMBOLS);
    expect(() => {
      (u.symbols as string[]).push('DOGE');
    }).toThrow();
  });
});

describe('rankAssets', () => {
  it('ranks by score descending with 1-based rank', () => {
    const ranked = rankAssets({ A: 3, B: 1, C: 2 });
    expect(ranked.map((r) => r.symbol)).toEqual(['A', 'C', 'B']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('assigns percentile 0 to top and 1 to bottom', () => {
    const ranked = rankAssets({ A: 3, B: 1, C: 2 });
    expect(ranked[0].percentile).toBe(0);
    expect(ranked[2].percentile).toBe(1);
  });

  it('handles ties deterministically via symbol tiebreak', () => {
    const scores = { Z: 5, A: 5, M: 5, B: 1 };
    const first = rankAssets(scores);
    expect(first).toEqual(rankAssets(scores));
    expect(first.map((r) => r.symbol)).toEqual(['A', 'M', 'Z', 'B']);
    expect(first.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('returns empty array for empty input', () => {
    expect(rankAssets({})).toEqual([]);
  });

  it('is deterministic across many seeded fixtures', () => {
    for (const seed of [1, 7, 42, 99]) {
      const scores = makeScores(20, seed);
      expect(rankAssets(scores)).toEqual(rankAssets(scores));
    }
  });
});

describe('percentileNormalize', () => {
  it('returns [] for empty input and zeros for equal values', () => {
    expect(percentileNormalize([])).toEqual([]);
    expect(percentileNormalize([4, 4, 4])).toEqual([0, 0, 0]);
  });

  it('keeps all outputs within [0, 1] and maps min→0, max→1', () => {
    const out = percentileNormalize(Object.values(makeScores(50, 3)));
    expect(out).toHaveLength(50);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(percentileNormalize([5, 1, 9, 3])).toEqual([0.5, 0, 1, 0.25]);
  });
});

describe('selectLongShort', () => {
  const assets: RankedAsset[] = rankAssets({ A: 5, B: 4, C: 3, D: 2, E: 1 });

  it('selects top N long and bottom N short', () => {
    const sel = selectLongShort(assets, 2, 2);
    expect(sel.long).toEqual(['A', 'B']);
    expect(sel.short).toEqual(['D', 'E']);
  });

  it('throws on negative, oversized, or non-integer N', () => {
    expect(() => selectLongShort(assets, -1, 1)).toThrow('topN');
    expect(() => selectLongShort(assets, 1, -1)).toThrow('bottomN');
    expect(() => selectLongShort(assets, 6, 1)).toThrow('topN');
    expect(() => selectLongShort(assets, 1, 6)).toThrow('bottomN');
    expect(() => selectLongShort(assets, 1.5, 1)).toThrow('topN');
  });

  it('handles zero selection', () => {
    const sel = selectLongShort(assets, 0, 0);
    expect(sel.long).toEqual([]);
    expect(sel.short).toEqual([]);
  });
});

describe('marketNeutralWeights', () => {
  it('sums to ≈ 0 for even-sized rankings', () => {
    const weights = marketNeutralWeights(rankAssets(makeScores(10, 5)));
    expect(Math.abs(sumWeights(weights))).toBeLessThan(EPSILON);
  });

  it('sums to ≈ 0 for odd-sized rankings (middle excluded)', () => {
    const weights = marketNeutralWeights(rankAssets(makeScores(9, 5)));
    expect(Math.abs(sumWeights(weights))).toBeLessThan(EPSILON);
    expect(Object.keys(weights)).toHaveLength(8);
  });

  it('assigns equal positive magnitude to longs and negative to shorts', () => {
    const weights = marketNeutralWeights(rankAssets({ A: 4, B: 3, C: 2, D: 1 }));
    expect(weights['A']).toBe(0.5);
    expect(weights['B']).toBe(0.5);
    expect(weights['C']).toBe(-0.5);
    expect(weights['D']).toBe(-0.5);
  });

  it('returns {} for empty input', () => {
    expect(marketNeutralWeights([])).toEqual({});
  });
});

describe('basketNeutralize', () => {
  it('zeros the net weight of a skewed basket', () => {
    const out = basketNeutralize({ A: 0.6, B: 0.3, C: 0.1 });
    expect(Math.abs(sumWeights(out))).toBeLessThan(EPSILON);
  });

  it('preserves relative ordering of weights', () => {
    const out = basketNeutralize({ A: 0.6, B: 0.3, C: 0.1 });
    expect(out['A']).toBeGreaterThan(out['B']);
    expect(out['B']).toBeGreaterThan(out['C']);
  });

  it('returns {} for empty input', () => {
    expect(basketNeutralize({})).toEqual({});
  });

  it('does not mutate the input weights', () => {
    const weights = { A: 0.6, B: 0.3, C: 0.1 };
    const copy = { ...weights };
    basketNeutralize(weights);
    expect(weights).toEqual(copy);
  });
});

describe('input immutability', () => {
  it('rankAssets does not mutate its input scores', () => {
    const scores = { A: 3, B: 1, C: 2 };
    const copy = { ...scores };
    rankAssets(scores);
    expect(scores).toEqual(copy);
  });

  it('selectLongShort and marketNeutralWeights do not mutate input assets', () => {
    const assets = rankAssets(makeScores(8, 11));
    const copy = assets.map((a) => ({ ...a }));
    selectLongShort(assets, 2, 2);
    marketNeutralWeights(assets);
    expect(assets).toEqual(copy);
  });
});
