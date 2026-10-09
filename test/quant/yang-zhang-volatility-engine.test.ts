import { describe, it, expect } from 'vitest';
import { YangZhangVolatilityEngine } from '../../src/tree/quantlib/volatility/yang-zhang-volatility-engine';
import type { OhlcBar } from '../../src/tree/quantlib/volatility/yang-zhang-volatility-types';

describe('YangZhangVolatilityEngine', () => {
  const engine = new YangZhangVolatilityEngine();

  it('throws error when bars length is less than 3', () => {
    const bars2: OhlcBar[] = [
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 102, high: 106, low: 98, close: 104 },
    ];
    expect(() => engine.estimate(bars2)).toThrow(/at least 3 bars/);
  });

  it('calculates zero volatility for perfectly static bars', () => {
    const staticBars: OhlcBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];
    const res = engine.estimate(staticBars);
    expect(res.overnightVariance).toBe(0);
    expect(res.openToCloseVariance).toBe(0);
    expect(res.rogersSatchellVariance).toBe(0);
    expect(res.compositeVariance).toBe(0);
    expect(res.annualizedVolatility).toBe(0);
    expect(res.optimalK).toBeGreaterThan(0);
  });

  it('correctly calculates volatility with overnight gaps and intraday ranges', () => {
    const bars: OhlcBar[] = [
      { open: 100, high: 102, low: 98, close: 101 },
      { open: 103, high: 105, low: 102, close: 104 }, // gap up overnight: 103 vs 101
      { open: 102, high: 106, low: 100, close: 105 }, // gap down overnight: 102 vs 104
      { open: 106, high: 108, low: 104, close: 107 }, // gap up
      { open: 105, high: 109, low: 103, close: 108 },
    ];
    const res = engine.estimate(bars, { annualizationFactor: 365 });

    expect(res.overnightVariance).toBeGreaterThan(0);
    expect(res.openToCloseVariance).toBeGreaterThan(0);
    expect(res.rogersSatchellVariance).toBeGreaterThan(0);
    expect(res.compositeVariance).toBeGreaterThan(0);
    expect(res.annualizedVolatility).toBeGreaterThan(0);
    expect(res.optimalK).toBeGreaterThan(0);
    expect(res.optimalK).toBeLessThan(1);
  });

  it('respects custom annualization factors', () => {
    const bars: OhlcBar[] = [
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 103, high: 108, low: 101, close: 106 },
      { open: 105, high: 110, low: 103, close: 107 },
      { open: 108, high: 112, low: 106, close: 110 },
    ];
    const resDaily = engine.estimate(bars, { annualizationFactor: 252 });
    const resCrypto = engine.estimate(bars, { annualizationFactor: 365 });

    expect(resCrypto.annualizedVolatility).toBeGreaterThan(resDaily.annualizedVolatility);
  });
});
