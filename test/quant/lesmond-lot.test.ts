import { describe, it, expect } from 'vitest';
import { LesmondLotEngine } from '@/tree/quantlib/liquidity/lesmond-lot-engine';

describe('LesmondLotEngine (1999 Zero-Return Transaction Cost)', () => {
  it('estimates zero-return proportion and asymmetric round-trip cost thresholds', () => {
    const returns = [0, 0.012, 0, -0.009, 0, 0.015, -0.011, 0, 0.014, -0.008];
    const engine = new LesmondLotEngine();
    const res = engine.estimate(returns, 1e-6);
    expect(res.zeroReturnProportion).toBe(0.4);
    expect(res.buyThresholdAlpha2).toBeGreaterThan(0);
    expect(res.sellThresholdAlpha1).toBeLessThan(0);
    expect(res.roundTripCost).toBeCloseTo(res.buyThresholdAlpha2 - res.sellThresholdAlpha1, 5);
    expect(res.latentVolatility).toBeGreaterThan(0);
    expect(res.sampleDays).toBe(10);
  });

  it('returns zero threshold when there are no zero-return days', () => {
    const returns = [0.01, -0.01, 0.02, -0.015, 0.012];
    const res = LesmondLotEngine.calculate({ returns });
    expect(res.zeroReturnProportion).toBe(0);
    expect(res.roundTripCost).toBe(0);
  });

  it('rejects insufficient observations or negative zero tolerance', () => {
    expect(() => LesmondLotEngine.calculate({ returns: [0.01, -0.01] })).toThrow();
    expect(() => LesmondLotEngine.calculate({ returns: [0.01, 0, -0.01], zeroTolerance: -0.001 })).toThrow();
  });
});
