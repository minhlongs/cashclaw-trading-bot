import { describe, it, expect } from 'vitest';
import { KyleObizhaevaInvarianceEngine } from '../../src/tree/quantlib/microstructure/kyle-obizhaeva-invariance-engine';

describe('KyleObizhaevaInvarianceEngine', () => {
  it('calculates trading velocity W = V * sigma accurately', () => {
    const engine = new KyleObizhaevaInvarianceEngine({
      dailyVolumeUsd: 10_000_000,
      dailyVolatility: 0.04,
    });
    expect(engine.getTradingVelocity()).toBe(400_000);
  });

  it('determines invariant benchmark bet size Q_tilde proportional to (V / sigma^2)^(1/3)', () => {
    const engine = new KyleObizhaevaInvarianceEngine({
      dailyVolumeUsd: 27_000_000,
      dailyVolatility: 0.001,
      betScaleConstant: 0.01,
    });
    // V / sigma^2 = 27,000,000 / 1e-6 = 2.7e13
    // cbrt(2.7e13) = 30000
    // Q_tilde = 0.01 * 30000 = 300
    expect(engine.getInvariantBetSize()).toBeCloseTo(300, 2);
  });

  it('computes square-root price impact and flags capacity constraints', () => {
    const engine = new KyleObizhaevaInvarianceEngine({
      dailyVolumeUsd: 10_000_000,
      dailyVolatility: 0.04,
      betScaleConstant: 5.0,
      impactScaleConstant: 1.0,
    });

    const invariantBet = engine.getInvariantBetSize(); // ~9210
    const smallOrder = engine.computeImpact(invariantBet * 0.2);
    expect(smallOrder.isCapacityConstrained).toBe(false);
    expect(smallOrder.priceImpactBps).toBeGreaterThan(0);

    const largeOrder = engine.computeImpact(invariantBet * 2.5);
    expect(largeOrder.isCapacityConstrained).toBe(true);
    expect(largeOrder.normalizedTradeSize).toBeCloseTo(2.5, 4);
    expect(largeOrder.priceImpactBps).toBeGreaterThan(smallOrder.priceImpactBps);
  });

  it('handles zero or boundary order sizes gracefully', () => {
    const engine = new KyleObizhaevaInvarianceEngine({
      dailyVolumeUsd: 500_000,
      dailyVolatility: 0.02,
    });

    const zeroOrder = engine.computeImpact(0);
    expect(zeroOrder.orderSizeUsd).toBe(0);
    expect(zeroOrder.normalizedTradeSize).toBe(0);
    expect(zeroOrder.priceImpactBps).toBe(0);
    expect(zeroOrder.isCapacityConstrained).toBe(false);
  });
});
