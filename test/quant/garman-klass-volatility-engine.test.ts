import { describe, it, expect } from 'vitest';
import { GarmanKlassVolatilityEngine } from '@/tree/quantlib/volatility/garman-klass-volatility-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/garman-klass-volatility-types';

describe('Garman-Klass & Parkinson Volatility Engine', () => {
  const engine = new GarmanKlassVolatilityEngine();

  it('throws an error if fewer than 2 bars are provided', () => {
    const singleBar: OhlcBar[] = [{ open: 100, high: 105, low: 95, close: 102 }];
    expect(() => engine.estimate(singleBar)).toThrow('at least 2 bars');
  });

  it('correctly calculates Parkinson, Garman-Klass, and GKYZ volatilities for standard bars', () => {
    const bars: OhlcBar[] = [
      { open: 100, high: 102, low: 99, close: 101 },
      { open: 101.5, high: 104, low: 100.5, close: 103 },
      { open: 102.8, high: 105.5, low: 102, close: 104.5 },
      { open: 104, high: 106, low: 103.5, close: 105 },
    ];

    const res = engine.estimate(bars, { annualizationFactor: 365 });

    expect(res.parkinsonVariance).toBeGreaterThan(0);
    expect(res.parkinsonVolatility).toBeGreaterThan(0);
    expect(res.garmanKlassVariance).toBeGreaterThan(0);
    expect(res.garmanKlassVolatility).toBeGreaterThan(0);
    expect(res.gkyzVariance).toBeGreaterThan(0);
    expect(res.gkyzVolatility).toBeGreaterThan(0);

    // GKYZ includes overnight jump variance, so it should typically be greater or equal to pure GK
    expect(res.gkyzVariance).toBeGreaterThanOrEqual(res.garmanKlassVariance);
  });

  it('returns zero variance when high equals low and open equals close with no jumps', () => {
    const flatBars: OhlcBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];

    const res = engine.estimate(flatBars);
    expect(res.parkinsonVariance).toBe(0);
    expect(res.garmanKlassVariance).toBe(0);
    expect(res.gkyzVariance).toBe(0);
  });
});
