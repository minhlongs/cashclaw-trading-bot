import { describe, it, expect } from 'vitest';
import { computeGlostenSpread } from '@/tree/quantlib/microstructure/glosten-spread-engine';

describe('Glosten (1994) Electronic Specialist Spread & LOB Equilibrium Engine', () => {
  it('computes monotonic marginal spread with respect to order size', () => {
    const res = computeGlostenSpread({
      midPrice: 100,
      orderSizes: [10, 50, 100, 500],
      baseSpread: 0.05,
      infoIntensity: 0.01,
      depthCurvature: 0.75,
    });

    expect(res.quotes).toHaveLength(4);
    for (let i = 1; i < res.quotes.length; i++) {
      expect(res.quotes[i].marginalSpread).toBeGreaterThan(res.quotes[i - 1].marginalSpread);
      expect(res.quotes[i].bidPrice).toBeLessThan(res.quotes[i - 1].bidPrice);
      expect(res.quotes[i].askPrice).toBeGreaterThan(res.quotes[i - 1].askPrice);
    }
    expect(res.averageEffectiveSpread).toBeGreaterThan(0.05);
    expect(res.quoteDepthScore).toBeGreaterThan(0);
  });

  it('incorporates specialist inventory imbalance penalty', () => {
    const neutral = computeGlostenSpread({
      midPrice: 50,
      orderSizes: [10],
      specialistInventory: 0,
      inventoryPenalty: 0.002,
    });

    const stressed = computeGlostenSpread({
      midPrice: 50,
      orderSizes: [10],
      specialistInventory: 200,
      inventoryPenalty: 0.002,
    });

    expect(stressed.quotes[0].inventoryCost).toBeGreaterThan(0);
    expect(stressed.quotes[0].marginalSpread).toBeGreaterThan(neutral.quotes[0].marginalSpread);
  });

  it('handles empty order size gracefully with fallback', () => {
    const res = computeGlostenSpread({
      midPrice: 50,
      orderSizes: [],
    });
    expect(res.quotes).toHaveLength(1);
    expect(res.averageEffectiveSpread).toBeGreaterThan(0);
  });
});
