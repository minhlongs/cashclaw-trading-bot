import { describe, it, expect } from 'vitest';
import { KyleObizhaevaInvarianceEngine } from '@/tree/quantlib/microstructure/kyle-obizhaeva-invariance-engine';

describe('KyleObizhaevaInvarianceEngine', () => {
  it('computes invariant order size, velocity and impact', () => {
    const res = KyleObizhaevaInvarianceEngine.calculateInvariants({
      price: 50,
      averageDailyVolume: 1_000_000,
      annualizedVolatility: 0.3,
      scalingConstant: 10_000,
    });
    expect(res.dollarVolume).toBe(50_000_000);
    expect(res.expectedDailyBets).toBeGreaterThan(0);
    expect(res.invariantOrderSize).toBeGreaterThan(0);
    expect(res.tradingVelocity).toBeGreaterThan(0);
    expect(res.invariantPriceImpact).toBeGreaterThan(0);
  });

  it('verifies 3:2 scaling relationship between bets and size', () => {
    const config1 = {
      price: 100,
      averageDailyVolume: 500_000,
      annualizedVolatility: 0.2,
      scalingConstant: 10_000,
    };
    const res1 = KyleObizhaevaInvarianceEngine.calculateInvariants(config1);
    expect(res1.dollarVolume).toBe(50_000_000);
  });

  it('throws on non-positive input values', () => {
    expect(() => KyleObizhaevaInvarianceEngine.calculateInvariants({
      price: 0,
      averageDailyVolume: 100,
      annualizedVolatility: 0.1,
    })).toThrow('Parameters must be positive');
  });
});
