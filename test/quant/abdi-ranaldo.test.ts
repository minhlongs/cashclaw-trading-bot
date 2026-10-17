import { describe, it, expect } from 'vitest';
import { AbdiRanaldoEngine } from '@/tree/quantlib/microstructure/abdi-ranaldo-engine';
import type { ChlBar } from '@/tree/quantlib/microstructure/abdi-ranaldo-types';

describe('AbdiRanaldoEngine (2017 Close-High-Low Spread)', () => {
  const sampleBars: ChlBar[] = [
    { high: 102.0, low: 98.0, close: 101.8 },
    { high: 102.2, low: 98.2, close: 98.4 },
    { high: 102.0, low: 98.0, close: 101.7 },
    { high: 102.1, low: 98.1, close: 98.5 },
  ];

  it('computes two-day-corrected and pooled-truncated CHL effective spread estimates', () => {
    const engine = new AbdiRanaldoEngine();
    const twoDay = engine.estimate(sampleBars, 'two-day-corrected');
    const pooled = AbdiRanaldoEngine.calculate({ bars: sampleBars, method: 'pooled-truncated' });
    expect(twoDay.effectiveSpread).toBeGreaterThan(0);
    expect(twoDay.effectiveSpreadBps).toBeGreaterThan(0);
    expect(pooled.effectiveSpread).toBeGreaterThan(0);
    expect(twoDay.meanMidRangeDeviation).toBeGreaterThan(0);
    expect(twoDay.pairCount).toBe(3);
  });

  it('rejects fewer than 2 bars or invalid price ordering', () => {
    expect(() => AbdiRanaldoEngine.calculate({ bars: [{ high: 101, low: 99, close: 100 }] })).toThrow();
    expect(() =>
      AbdiRanaldoEngine.calculate({
        bars: [
          { high: 101, low: 99, close: 0 },
          { high: 101, low: 99, close: 100 },
        ],
      }),
    ).toThrow();
    expect(() =>
      AbdiRanaldoEngine.calculate({
        bars: [
          { high: 98, low: 100, close: 99 },
          { high: 101, low: 99, close: 100 },
        ],
      }),
    ).toThrow();
  });
});
