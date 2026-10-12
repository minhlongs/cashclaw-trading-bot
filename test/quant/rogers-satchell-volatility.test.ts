import { describe, it, expect } from 'vitest';
import { RogersSatchellVolatilityEngine } from '@/tree/quantlib/volatility/rogers-satchell-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/rogers-satchell-types';

describe('Rogers-Satchell (1991) Volatility Estimator', () => {
  const bars: OhlcBar[] = [
    { open: 100, high: 105, low: 98, close: 104 },
    { open: 104, high: 108, low: 102, close: 107 },
    { open: 107, high: 112, low: 105, close: 111 },
    { open: 111, high: 115, low: 109, close: 114 },
  ];

  it('calculates drift-independent continuous volatility correctly', () => {
    const res = RogersSatchellVolatilityEngine.calculate({ bars, annualizationFactor: 365 });
    expect(res.rawVariance).toBeGreaterThan(0);
    expect(res.annualizedVolatility).toBeGreaterThan(0);
    expect(res.barCount).toBe(4);
    expect(res.driftIndependent).toBe(true);
  });

  it('supports instance method estimation', () => {
    const engine = new RogersSatchellVolatilityEngine();
    const res = engine.estimate(bars);
    expect(res.rawVariance).toBeGreaterThan(0);
    expect(res.barCount).toBe(4);
  });

  it('throws for insufficient bars or invalid prices', () => {
    expect(() => RogersSatchellVolatilityEngine.calculate({ bars: [] })).toThrow();
    expect(() => RogersSatchellVolatilityEngine.calculate({ bars: [bars[0]] })).toThrow();
    expect(() =>
      RogersSatchellVolatilityEngine.calculate({
        bars: [{ open: -1, high: 10, low: 5, close: 8 }, bars[1]],
      }),
    ).toThrow();
  });
});
