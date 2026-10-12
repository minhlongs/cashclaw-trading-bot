import { describe, it, expect } from 'vitest';
import { RollImplicitSpreadEngine } from '@/tree/quantlib/microstructure/roll-implicit-spread-engine';

describe('RollImplicitSpreadEngine', () => {
  it('calculates Roll spread under negative autocovariance', () => {
    // Alternating bounce prices: +1, -1, +1, -1, +1, -1
    const priceChanges = [1, -1, 1, -1, 1, -1];
    const res = RollImplicitSpreadEngine.calculateSpread({
      priceChanges,
      referencePrice: 100,
    });
    expect(res.serialCovariance).toBeLessThan(0);
    expect(res.isPositiveCovariance).toBe(false);
    expect(res.rollSpread).toBeGreaterThan(0);
    expect(res.percentageSpread).toBeCloseTo(res.rollSpread / 100, 6);
  });

  it('handles positive autocovariance by returning zero spread', () => {
    // Trending changes: large then large, small then small
    const priceChanges = [2, 2.1, 1.9, 2.05, 0.1, 0.2, 0.1, 0.15];
    const res = RollImplicitSpreadEngine.calculateSpread({
      priceChanges,
    });
    expect(res.isPositiveCovariance).toBe(true);
    expect(res.rollSpread).toBe(0);
    expect(res.percentageSpread).toBeUndefined();
  });

  it('throws on insufficient price series length', () => {
    expect(() => RollImplicitSpreadEngine.calculateSpread({
      priceChanges: [1],
    })).toThrow('Requires at least 2 price changes');
  });
});
