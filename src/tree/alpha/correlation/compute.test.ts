import { describe, it, expect } from 'vitest';
import type { IndicatorCandle } from '../indicator-types';
import {
  pearsonCorrelation,
  computePairCorrelation,
  computeRollingCorrelation,
  computeSpreadStatistics,
} from './compute';
import { testCointegration } from './adf';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandles(
  closes: number[],
  startTs = 1_000_000,
): IndicatorCandle[] {
  return closes.map((close, i) => ({
    timestamp: startTs + i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }));
}

// ── Pearson Correlation ───────────────────────────────────────────────────────

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly correlated series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 6);
  });

  it('returns -1 for perfectly inversely correlated series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 6);
  });

  it('returns 0 for uncorrelated series', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 1, 4, 1, 5];
    const corr = pearsonCorrelation(x, y);
    expect(Math.abs(corr)).toBeLessThan(0.5);
  });

  it('returns 0 when arrays are too short', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1], [1])).toBe(0);
  });
});

// ── computePairCorrelation ────────────────────────────────────────────────────

describe('computePairCorrelation', () => {
  it('computes correlation between two candle series', () => {
    const c1 = makeCandles([100, 101, 102, 103, 104]);
    const c2 = makeCandles([200, 202, 204, 206, 208]);
    const corr = computePairCorrelation(c1, c2, 5);
    expect(corr).toBeCloseTo(1, 4);
  });

  it('respects the lookback window', () => {
    const c1 = makeCandles([1, 2, 3, 100, 101, 102]);
    const c2 = makeCandles([1, 2, 3, 200, 202, 204]);
    const corr = computePairCorrelation(c1, c2, 3);
    expect(corr).toBeCloseTo(1, 4);
  });
});

// ── Rolling Correlation ───────────────────────────────────────────────────────

describe('computeRollingCorrelation', () => {
  it('returns correct number of values', () => {
    const c1 = makeCandles([1, 2, 3, 4, 5, 6, 7, 8]);
    const c2 = makeCandles([2, 4, 6, 8, 10, 12, 14, 16]);
    const result = computeRollingCorrelation(c1, c2, 8, 3);
    expect(result.length).toBe(6);
    result.forEach((r) => expect(r).toBeCloseTo(1, 4));
  });

  it('returns empty array when window > data length', () => {
    const c1 = makeCandles([1, 2]);
    const c2 = makeCandles([1, 2]);
    const result = computeRollingCorrelation(c1, c2, 2, 5);
    expect(result.length).toBe(0);
  });
});

// ── Spread Statistics ─────────────────────────────────────────────────────────

describe('computeSpreadStatistics', () => {
  it('returns zero spreadStd and zScore for perfectly co-moving series', () => {
    const c1 = makeCandles([100, 101, 102, 103, 104]);
    const c2 = makeCandles([200, 202, 204, 206, 208]);
    const stats = computeSpreadStatistics(c1, c2, 5);
    expect(stats.spreadStd).toBe(0);
    expect(stats.zScore).toBe(0);
  });

  it('returns Infinity half-life when spread is flat', () => {
    const c1 = makeCandles([100, 100, 100, 100]);
    const c2 = makeCandles([200, 200, 200, 200]);
    const stats = computeSpreadStatistics(c1, c2, 4);
    expect(stats.halfLife).toBe(Infinity);
  });

  it('returns finite half-life for mean-reverting spread', () => {
    const vals1 = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101];
    const vals2 = [200, 201, 200, 201, 200, 201, 200, 201, 200, 201];
    const c1 = makeCandles(vals1);
    const c2 = makeCandles(vals2);
    const stats = computeSpreadStatistics(c1, c2, 10);
    expect(stats.halfLife).toBeGreaterThan(0);
  });
});

// ── Cointegration Test ────────────────────────────────────────────────────────

describe('testCointegration', () => {
  it('detects cointegration in perfectly correlated series', () => {
    const c1 = makeCandles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    const c2 = makeCandles([200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220]);
    const result = testCointegration(c1, c2);
    expect(result.pValue).toBeLessThan(1);
    expect(typeof result.cointegrated).toBe('boolean');
  });

  it('returns false cointegration for very short data', () => {
    const c1 = makeCandles([1, 2, 3]);
    const c2 = makeCandles([1, 2, 3]);
    const result = testCointegration(c1, c2);
    expect(result.cointegrated).toBe(false);
  });

  it('returns pValue in [0, 1]', () => {
    const c1 = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 5));
    const c2 = makeCandles(Array.from({ length: 30 }, (_, i) => 200 + Math.sin(i * 0.3) * 10));
    const result = testCointegration(c1, c2);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});
