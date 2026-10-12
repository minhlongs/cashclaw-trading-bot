import { describe, it, expect } from 'vitest';
import { ParkinsonVolatilityEngine } from '@/tree/quantlib/volatility/parkinson-volatility-engine';
import type { HighLowBar } from '@/tree/quantlib/volatility/parkinson-volatility-types';

describe('ParkinsonVolatilityEngine', () => {
  it('throws on empty bars', () => {
    expect(() => ParkinsonVolatilityEngine.calculate({ bars: [] })).toThrow('At least one bar is required');
  });

  it('throws on invalid high/low values', () => {
    const bad: HighLowBar = { high: 90, low: 100 };
    expect(() => ParkinsonVolatilityEngine.calculate({ bars: [bad] })).toThrow('Invalid high/low values');
  });

  it('returns zero variance when high equals low', () => {
    const bars: HighLowBar[] = [
      { high: 100, low: 100 },
      { high: 102, low: 102 },
    ];
    const res = ParkinsonVolatilityEngine.calculate({ bars });
    expect(res.rawVariance).toBe(0);
    expect(res.annualizedVolatility).toBe(0);
    expect(res.barCount).toBe(2);
  });

  it('calculates volatility correctly for high-low spread', () => {
    const bars: HighLowBar[] = [
      { high: 110, low: 90 },
      { high: 105, low: 95 },
    ];
    const res = ParkinsonVolatilityEngine.calculate({ bars, annualizationFactor: 365 });
    expect(res.rawVariance).toBeGreaterThan(0);
    expect(res.annualizedVolatility).toBeGreaterThan(0);
    expect(res.barCount).toBe(2);
    expect(res.constantMultiplier).toBeCloseTo(1 / (4 * Math.LN2), 5);
  });
});
