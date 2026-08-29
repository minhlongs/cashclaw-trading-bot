import { describe, it, expect } from 'vitest';
import { buildWeights, resolveCostFraction, validateConfig } from './weight-builder';
import type { CrossSectionalSimConfig } from './types';
import type { RankedAsset } from '@/tree/alpha/universe/types';

function ranked(symbol: string, score: number, rank: number): RankedAsset {
  return { symbol, score, rank, percentile: 0 };
}

// ── resolveCostFraction ──────────────────────────────────────────────────────

describe('resolveCostFraction', () => {
  it('uses costBps directly when set', () => {
    expect(resolveCostFraction({ costBps: 10 } as CrossSectionalSimConfig)).toBeCloseTo(0.001, 9);
    expect(resolveCostFraction({ costBps: 50 } as CrossSectionalSimConfig)).toBeCloseTo(0.005, 9);
  });

  it('falls back to stress-mode sum when costBps is absent', () => {
    // conservative = fee 0.0010 + slip 0.0007 + impact 0.0010 = 0.0027
    expect(resolveCostFraction({} as CrossSectionalSimConfig)).toBeCloseTo(0.0027, 9);
  });

  it('resolves each stress mode', () => {
    expect(resolveCostFraction({ stressMode: 'normal' } as CrossSectionalSimConfig)).toBeCloseTo(0.0016, 9);
    expect(resolveCostFraction({ stressMode: 'adverse' } as CrossSectionalSimConfig)).toBeCloseTo(0.005, 9);
    expect(resolveCostFraction({ stressMode: 'extreme' } as CrossSectionalSimConfig)).toBeCloseTo(0.010, 9);
  });
});

// ── buildWeights ─────────────────────────────────────────────────────────────

describe('buildWeights', () => {
  const assets = [ranked('A', 3, 1), ranked('B', 2, 2), ranked('C', 1, 3)];

  it('uses the default equal-weight long/short construction', () => {
    const w = buildWeights(assets, { topN: 1, bottomN: 1, minObservations: 1 });
    expect(w).toEqual({ A: 1, C: -1 });
  });

  it('uses a custom weighter when provided', () => {
    const weighter = (xs: readonly RankedAsset[]) =>
      Object.fromEntries(xs.map((a) => [a.symbol, a.score / 10]));
    const w = buildWeights(assets, {
      topN: 1, bottomN: 1, minObservations: 1, weighter,
    });
    expect(w).toEqual({ A: 0.3, B: 0.2, C: 0.1 });
  });

  it('drops zero weights', () => {
    const w = buildWeights(assets, {
      topN: 1, bottomN: 1, minObservations: 1,
      weighter: () => ({ A: 0, B: 0.5, C: -0.5 }),
    });
    expect(w).toEqual({ B: 0.5, C: -0.5 });
  });

  it('drops non-finite weights', () => {
    const w = buildWeights(assets, {
      topN: 1, bottomN: 1, minObservations: 1,
      weighter: () => ({ A: NaN, B: Infinity, C: -Infinity }),
    });
    expect(w).toEqual({});
  });

  it('returns an empty map when nothing survives', () => {
    const w = buildWeights([], { topN: 0, bottomN: 0, minObservations: 1 });
    expect(w).toEqual({});
  });
});

// ── validateConfig ───────────────────────────────────────────────────────────

describe('validateConfig', () => {
  const base = (): CrossSectionalSimConfig => ({
    topN: 1, bottomN: 1, minObservations: 1,
  });

  it('accepts a valid config', () => {
    expect(() => validateConfig(base())).not.toThrow();
  });

  it('accepts a zero top/bottom pair when a weighter is present', () => {
    expect(() => validateConfig({ ...base(), topN: 0, bottomN: 0, weighter: () => ({}) })).not.toThrow();
  });

  it('rejects a negative topN', () => {
    expect(() => validateConfig({ ...base(), topN: -1 })).toThrow(/topN must be a non-negative integer/);
  });

  it('rejects a non-integer topN', () => {
    expect(() => validateConfig({ ...base(), topN: 1.5 })).toThrow(/topN must be a non-negative integer/);
  });

  it('rejects a negative bottomN', () => {
    expect(() => validateConfig({ ...base(), bottomN: -1 })).toThrow(/bottomN must be a non-negative integer/);
  });

  it('rejects a non-integer bottomN', () => {
    expect(() => validateConfig({ ...base(), bottomN: 2.5 })).toThrow(/bottomN must be a non-negative integer/);
  });

  it('rejects a minObservations below 1', () => {
    expect(() => validateConfig({ ...base(), minObservations: 0 })).toThrow(/minObservations must be a positive integer/);
  });

  it('rejects a non-integer minObservations', () => {
    expect(() => validateConfig({ ...base(), minObservations: 1.5 })).toThrow(/minObservations must be a positive integer/);
  });

  it('rejects a negative costBps', () => {
    expect(() => validateConfig({ ...base(), costBps: -5 })).toThrow(/costBps must be a non-negative finite number/);
  });

  it('rejects a non-finite costBps', () => {
    expect(() => validateConfig({ ...base(), costBps: Number.POSITIVE_INFINITY })).toThrow(/costBps must be a non-negative finite number/);
  });

  it('rejects topN and bottomN both zero without a weighter', () => {
    expect(() => validateConfig({ ...base(), topN: 0, bottomN: 0 })).toThrow(/topN and bottomN cannot both be 0 without a weighter/);
  });
});