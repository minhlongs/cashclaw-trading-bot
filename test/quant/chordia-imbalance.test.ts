import { describe, it, expect } from 'vitest';
import { computeChordiaOrderImbalance } from '@/tree/quantlib/microstructure/chordia-imbalance-engine';

describe('Chordia-Roll-Subrahmanyam (2005) Order Imbalance Dynamics Engine', () => {
  it('computes volume imbalance, spread expansion, and reversal expectations', () => {
    const res = computeChordiaOrderImbalance({
      buyerVolume: 15_000,
      sellerVolume: 5_000,
      returnVolatility: 0.02,
      baselineSpreadBps: 2.0,
      imbalanceSensitivity: 4.0,
      reversalCoefficient: 1.5,
    });

    expect(res.orderImbalanceShares).toBe(10_000);
    expect(res.orderImbalanceRatio).toBeCloseTo(0.5, 4);
    expect(res.adversePressureBps).toBeCloseTo(2.0, 4);
    expect(res.dynamicSpreadBps).toBeCloseTo(2.0 + 2.0 + 50 * 0.02, 4);
    expect(res.expectedReversalBps).toBeCloseTo(-0.75, 4);
    expect(res.isLiquidityDrained).toBe(true);
  });

  it('handles symmetric order flow without liquidity drain', () => {
    const res = computeChordiaOrderImbalance({
      buyerVolume: 10_000,
      sellerVolume: 10_000,
      returnVolatility: 0.01,
      baselineSpreadBps: 1.5,
    });

    expect(res.orderImbalanceShares).toBe(0);
    expect(res.orderImbalanceRatio).toBe(0);
    expect(res.adversePressureBps).toBe(0);
    expect(res.dynamicSpreadBps).toBeCloseTo(1.5 + 50 * 0.01, 4);
    expect(res.expectedReversalBps).toBe(0);
    expect(res.isLiquidityDrained).toBe(false);
  });
});
