import { describe, it, expect } from 'vitest';
import { YangZhangVolatilityEngine } from '@/tree/quantlib/volatility/yang-zhang-volatility-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/garman-klass-volatility-types';

describe('YangZhangVolatilityEngine', () => {
  it('throws when fewer than 3 bars are provided', () => {
    const single: OhlcBar[] = [{ open: 100, high: 105, low: 95, close: 100 }];
    expect(() => YangZhangVolatilityEngine.calculate({ bars: single })).toThrow('at least 3 bars');
  });

  it('returns zero variance for perfectly flat series', () => {
    const flat: OhlcBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];
    const res = YangZhangVolatilityEngine.calculate({ bars: flat });
    expect(res.rawVariance).toBe(0);
    expect(res.annualizedVolatility).toBe(0);
    expect(res.overnightVariance).toBe(0);
    expect(res.openToCloseVariance).toBe(0);
    expect(res.rogersSatchellVariance).toBe(0);
    expect(res.barCount).toBe(3);
  });

  it('calculates overnight jumps and Rogers-Satchell components', () => {
    const bars: OhlcBar[] = [
      { open: 100, high: 105, low: 98, close: 102 },
      { open: 106, high: 110, low: 104, close: 108 },
      { open: 107, high: 112, low: 105, close: 109 },
    ];
    const res = YangZhangVolatilityEngine.calculate({ bars, annualizationFactor: 252 });
    expect(res.rawVariance).toBeGreaterThan(0);
    expect(res.annualizedVolatility).toBeGreaterThan(0);
    expect(res.overnightVariance).toBeGreaterThan(0);
    expect(res.kFactor).toBeGreaterThan(0);
    expect(res.kFactor).toBeLessThan(1);
    expect(res.barCount).toBe(3);
  });
});
