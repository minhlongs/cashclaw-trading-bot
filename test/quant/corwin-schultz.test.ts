import { describe, it, expect } from 'vitest';
import { CorwinSchultzEngine } from '@/tree/quantlib/microstructure/corwin-schultz-engine';
import type { HighLowBar } from '@/tree/quantlib/microstructure/corwin-schultz-types';

describe('CorwinSchultzEngine (2012 High-Low Bid-Ask Spread)', () => {
  const sampleBars: HighLowBar[] = [
    { high: 102.0, low: 98.0 },
    { high: 102.2, low: 98.1 },
    { high: 102.1, low: 97.9 },
    { high: 102.3, low: 98.2 },
  ];

  it('estimates positive effective bid-ask spread when single-day ranges repeat across two-day windows', () => {
    const engine = new CorwinSchultzEngine();
    const res = engine.estimate(sampleBars);
    expect(res.estimatedSpread).toBeGreaterThan(0);
    expect(res.estimatedSpreadBps).toBeGreaterThan(0);
    expect(res.meanBeta).toBeGreaterThan(0);
    expect(res.meanGamma).toBeGreaterThan(0);
    expect(res.pairCount).toBe(3);
  });

  it('clamps negative overnight spread jumps to zero by default and allows raw negative alpha when disabled', () => {
    const trendingBars: HighLowBar[] = [
      { high: 101, low: 100 },
      { high: 112, low: 110 },
    ];
    const clamped = CorwinSchultzEngine.calculate({ bars: trendingBars, clampNegativeSpread: true });
    expect(clamped.estimatedSpread).toBe(0);
    const unclamped = CorwinSchultzEngine.calculate({ bars: trendingBars, clampNegativeSpread: false });
    expect(unclamped.meanAlpha).toBeLessThan(0);
  });

  it('rejects insufficient or invalid high-low bars', () => {
    expect(() => CorwinSchultzEngine.calculate({ bars: [{ high: 105, low: 100 }] })).toThrow();
    expect(() => CorwinSchultzEngine.calculate({ bars: [{ high: 0, low: 100 }, { high: 105, low: 100 }] })).toThrow();
    expect(() => CorwinSchultzEngine.calculate({ bars: [{ high: 95, low: 100 }, { high: 105, low: 100 }] })).toThrow();
  });
});
