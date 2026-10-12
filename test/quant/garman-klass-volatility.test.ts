import { describe, it, expect } from 'vitest';
import { GarmanKlassVolatilityEngine } from '@/tree/quantlib/volatility/garman-klass-volatility-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/garman-klass-volatility-types';

describe('GarmanKlassVolatilityEngine', () => {
  it('throws when bar list is empty or fewer than 2 bars', () => {
    expect(() => GarmanKlassVolatilityEngine.calculate({ bars: [] })).toThrow(/at least/i);
    const singleBar: OhlcBar[] = [{ open: 100, high: 105, low: 95, close: 102 }];
    expect(() => GarmanKlassVolatilityEngine.calculate({ bars: singleBar })).toThrow(/at least 2 bars/i);
  });

  it('throws on non-positive prices', () => {
    const invalid: OhlcBar[] = [
      { open: 100, high: 105, low: 0, close: 102 },
      { open: 102, high: 106, low: 98, close: 104 },
    ];
    expect(() => GarmanKlassVolatilityEngine.calculate({ bars: invalid })).toThrow('Prices must be positive');
  });

  it('calculates zero variance for constant prices', () => {
    const flat: OhlcBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];
    const res = GarmanKlassVolatilityEngine.calculate({ bars: flat });
    expect(res.rawVariance).toBe(0);
    expect(res.annualizedVolatility).toBe(0);
    expect(res.efficiencyGain).toBe(7.4);
    expect(res.barCount).toBe(2);
  });

  it('calculates non-zero volatility for price movements', () => {
    const bars: OhlcBar[] = [
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 102, high: 108, low: 100, close: 105 },
      { open: 105, high: 106, low: 98, run: 99 } as unknown as OhlcBar,
    ];
    const validBars: OhlcBar[] = [
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 102, high: 108, low: 100, close: 105 },
      { open: 105, high: 106, low: 98, close: 99 },
    ];
    const res = GarmanKlassVolatilityEngine.calculate({ bars: validBars, annualizationFactor: 252 });
    expect(res.rawVariance).toBeGreaterThan(0);
    expect(res.annualizedVolatility).toBeGreaterThan(0);
    expect(res.barCount).toBe(3);
  });
});
