import { describe, expect, it } from 'vitest';
import { simulateShadowFill, simulateShadowFills } from '../shadow-simulator';
import { ShadowFillSchema } from '../schemas';
import type { CostStressTier, ShadowOrder } from '../types';

describe('shadow-simulator', () => {
  const sampleBuyOrder: ShadowOrder = {
    orderId: 'ord_BTC_1700000000000_0',
    symbol: 'BTC',
    side: 'buy',
    size: 10_000,
    price: 100,
    targetWeightDelta: 0.1,
    decisionTimestamp: 1_700_000_000_000,
  };

  const sampleSellOrder: ShadowOrder = {
    orderId: 'ord_ETH_1700000000000_1',
    symbol: 'ETH',
    side: 'sell',
    size: 5_000,
    price: 100,
    targetWeightDelta: -0.05,
    decisionTimestamp: 1_700_000_000_000,
  };

  it('simulates fills accurately across all 4 cost stress tiers', () => {
    const tiers: CostStressTier[] = ['normal', 'conservative', 'adverse', 'extreme'];
    const expectedSlipBps = [8.0, 17.0, 40.0, 85.0];
    const expectedFillPrices = [100.08, 100.17, 100.4, 100.85];

    tiers.forEach((tier, idx) => {
      const fill = simulateShadowFill(sampleBuyOrder, {
        arrivalPrice: 100,
        latencyMs: 15,
        stressTier: tier,
      });

      expect(fill.stressTier).toBe(tier);
      expect(fill.fillPrice).toBeCloseTo(expectedFillPrices[idx]!, 4);
      expect(fill.slippageBps).toBeCloseTo(expectedSlipBps[idx]!, 4);
      expect(fill.fillQuantity).toBeCloseTo(100);
      expect(() => ShadowFillSchema.parse(fill)).not.toThrow();
    });
  });

  it('advances fill timestamp causally with latency and honors override', () => {
    const fill = simulateShadowFill(sampleBuyOrder, {
      arrivalPrice: 100,
      latencyMs: 85,
      stressTier: 'normal',
    });
    expect(fill.fillTimestamp).toBe(1_700_000_000_085);

    const overridden = simulateShadowFill(sampleBuyOrder, {
      arrivalPrice: 100,
      latencyMs: 85,
      stressTier: 'normal',
      fillTimestampOverride: 1_700_000_000_500,
    });
    expect(overridden.fillTimestamp).toBe(1_700_000_000_500);
  });

  it('evaluates adverse arrival price drift and directional slippage', () => {
    // Buy with adverse price rise (arrival 102 vs decision 100)
    const buyDrift = simulateShadowFill(sampleBuyOrder, {
      arrivalPrice: 102,
      latencyMs: 25,
      stressTier: 'normal',
    });
    // P_fill = 102 * 1.0008 = 102.0816, slipBps = ((102.0816 - 100) / 100) * 10000 = 208.16
    expect(buyDrift.fillPrice).toBeCloseTo(102.0816, 4);
    expect(buyDrift.slippageBps).toBeCloseTo(208.16, 2);

    // Sell with normal execution (P_fill = 100 * (1 - 0.0008) = 99.92, slipBps = +8.0)
    const sellFill = simulateShadowFill(sampleSellOrder, {
      arrivalPrice: 100,
      latencyMs: 25,
      stressTier: 'normal',
    });
    expect(sellFill.fillPrice).toBeCloseTo(99.92, 4);
    expect(sellFill.slippageBps).toBeCloseTo(8.0, 4);
  });

  it('calculates transaction fees according to tier schedule', () => {
    const fill = simulateShadowFill(sampleBuyOrder, {
      arrivalPrice: 100,
      latencyMs: 10,
      stressTier: 'conservative', // feePct = 0.0010
    });
    // Q = 100, P_fill = 100.17 -> fee = 100.17 * 100 * 0.0010 = 10.017
    expect(fill.feeAmount).toBeCloseTo(10.017, 4);
  });

  it('executes batch simulations with uniform params or symbol/orderId maps', () => {
    const orders = [sampleBuyOrder, sampleSellOrder];

    // Uniform params
    const uniformFills = simulateShadowFills(orders, {
      arrivalPrice: 100,
      latencyMs: 20,
      stressTier: 'normal',
    });
    expect(uniformFills).toHaveLength(2);
    expect(uniformFills[0]?.symbol).toBe('BTC');
    expect(uniformFills[1]?.symbol).toBe('ETH');

    // Per-symbol map
    const mappedFills = simulateShadowFills(orders, {
      BTC: { arrivalPrice: 101, latencyMs: 30, stressTier: 'adverse' },
      ETH: { arrivalPrice: 99, latencyMs: 15, stressTier: 'conservative' },
    });
    expect(mappedFills[0]?.stressTier).toBe('adverse');
    expect(mappedFills[1]?.stressTier).toBe('conservative');

    // Empty orders returns empty array
    expect(simulateShadowFills([], { arrivalPrice: 100, latencyMs: 0, stressTier: 'normal' })).toEqual([]);

    // Missing order symbol in map throws error
    expect(() =>
      simulateShadowFills(orders, {
        BTC: { arrivalPrice: 100, latencyMs: 10, stressTier: 'normal' },
      }),
    ).toThrow(/missing simulation params/i);
  });

  it('fails closed on invalid parameters', () => {
    expect(() =>
      simulateShadowFill(sampleBuyOrder, {
        arrivalPrice: -1,
        latencyMs: 10,
        stressTier: 'normal',
      }),
    ).toThrow(RangeError);

    expect(() =>
      simulateShadowFill(sampleBuyOrder, {
        arrivalPrice: 100,
        latencyMs: -5,
        stressTier: 'normal',
      }),
    ).toThrow(RangeError);

    expect(() =>
      simulateShadowFill(sampleBuyOrder, {
        arrivalPrice: 100,
        latencyMs: 10,
        stressTier: 'invalid_tier' as CostStressTier,
      }),
    ).toThrow();
  });
});
