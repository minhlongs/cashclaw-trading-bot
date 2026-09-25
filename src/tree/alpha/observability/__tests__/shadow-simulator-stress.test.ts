import { describe, expect, it } from 'vitest';
import { simulateShadowFill, simulateShadowFills } from '../shadow-simulator';
import { ShadowFillSchema } from '../schemas';
import type { CostStressTier, ShadowOrder } from '../types';

describe('shadow-simulator adversarial stress tests', () => {
  const tiers: readonly CostStressTier[] = ['normal', 'conservative', 'adverse', 'extreme'];

  const makeOrder = (side: 'buy' | 'sell', price = 100, size = 10_000, orderId = 'ord_1'): ShadowOrder => ({
    orderId,
    symbol: 'BTC/USDT',
    side,
    size,
    price,
    targetWeightDelta: side === 'buy' ? 0.1 : -0.1,
    decisionTimestamp: 1_700_000_000_000,
  });

  it('verifies strict monotonic cost tier ordering across all 4 tiers', () => {
    const buyOrder = makeOrder('buy', 100, 10_000);
    const sellOrder = makeOrder('sell', 100, 10_000);
    const arrivalPrice = 100;

    const buyFills = tiers.map((tier) => simulateShadowFill(buyOrder, { arrivalPrice, latencyMs: 10, stressTier: tier }));
    const sellFills = tiers.map((tier) => simulateShadowFill(sellOrder, { arrivalPrice, latencyMs: 10, stressTier: tier }));

    for (let i = 0; i < tiers.length - 1; i++) {
      // Buy fill price & slippage must strictly increase
      expect(buyFills[i + 1]!.fillPrice).toBeGreaterThan(buyFills[i]!.fillPrice);
      expect(buyFills[i + 1]!.slippageBps).toBeGreaterThan(buyFills[i]!.slippageBps);

      // Sell fill price must strictly decrease, while slippage friction strictly increases
      expect(sellFills[i + 1]!.fillPrice).toBeLessThan(sellFills[i]!.fillPrice);
      expect(sellFills[i + 1]!.slippageBps).toBeGreaterThan(sellFills[i]!.slippageBps);

      // Total friction (effective spread + fee) strictly increases
      const buyFrictionCurr = (buyFills[i]!.fillPrice - arrivalPrice) * buyFills[i]!.fillQuantity + buyFills[i]!.feeAmount;
      const buyFrictionNext = (buyFills[i + 1]!.fillPrice - arrivalPrice) * buyFills[i + 1]!.fillQuantity + buyFills[i + 1]!.feeAmount;
      expect(buyFrictionNext).toBeGreaterThan(buyFrictionCurr);

      const sellFrictionCurr = (arrivalPrice - sellFills[i]!.fillPrice) * sellFills[i]!.fillQuantity + sellFills[i]!.feeAmount;
      const sellFrictionNext = (arrivalPrice - sellFills[i + 1]!.fillPrice) * sellFills[i + 1]!.fillQuantity + sellFills[i + 1]!.feeAmount;
      expect(sellFrictionNext).toBeGreaterThan(sellFrictionCurr);
    }
  });

  it('guarantees directional invariant (buy >= arrival, sell <= arrival) under 200 random market scenarios', () => {
    const testPrices = [0.0001, 0.45, 1.0, 42.5, 100, 2500, 68000, 1_000_000];

    for (let i = 0; i < 200; i++) {
      const basePrice = testPrices[i % testPrices.length]!;
      // Gap multiplier from -50% to +100%
      const gapMultiplier = 0.5 + (i * 0.0075);
      const arrivalPrice = basePrice * gapMultiplier;
      const tier = tiers[i % tiers.length]!;

      const buyFill = simulateShadowFill(makeOrder('buy', basePrice, 5_000), { arrivalPrice, latencyMs: i * 10, stressTier: tier });
      expect(buyFill.fillPrice).toBeGreaterThanOrEqual(arrivalPrice);
      expect(buyFill.fillPrice).toBeGreaterThan(arrivalPrice);

      const sellFill = simulateShadowFill(makeOrder('sell', basePrice, 5_000), { arrivalPrice, latencyMs: i * 10, stressTier: tier });
      expect(sellFill.fillPrice).toBeLessThanOrEqual(arrivalPrice);
      expect(sellFill.fillPrice).toBeLessThan(arrivalPrice);
    }
  });

  it('handles extreme latency (0ms, 60,000ms, fractional) and flash shocks (±20%, ±99%, +500%)', () => {
    const decisionPrice = 100;
    const buyOrder = makeOrder('buy', decisionPrice, 10_000);
    const sellOrder = makeOrder('sell', decisionPrice, 10_000);

    // 0ms latency
    const zeroLatencyFill = simulateShadowFill(buyOrder, { arrivalPrice: 100, latencyMs: 0, stressTier: 'normal' });
    expect(zeroLatencyFill.fillTimestamp).toBe(buyOrder.decisionTimestamp);

    // 60,000ms latency
    const longLatencyFill = simulateShadowFill(buyOrder, { arrivalPrice: 100, latencyMs: 60_000, stressTier: 'normal' });
    expect(longLatencyFill.fillTimestamp).toBe(buyOrder.decisionTimestamp + 60_000);

    // Fractional latency rounding
    const fracFill = simulateShadowFill(buyOrder, { arrivalPrice: 100, latencyMs: 42.7, stressTier: 'normal' });
    expect(fracFill.fillTimestamp).toBe(buyOrder.decisionTimestamp + 43);

    // Flash Shock: +20% price gap
    const buyShockUp = simulateShadowFill(buyOrder, { arrivalPrice: 120, latencyMs: 50, stressTier: 'normal' });
    expect(buyShockUp.fillPrice).toBeCloseTo(120.096, 4);
    expect(buyShockUp.slippageBps).toBeCloseTo(2009.6, 2);

    const sellShockUp = simulateShadowFill(sellOrder, { arrivalPrice: 120, latencyMs: 50, stressTier: 'normal' });
    expect(sellShockUp.fillPrice).toBeCloseTo(119.904, 4);
    expect(sellShockUp.slippageBps).toBeCloseTo(-1990.4, 2);

    // Flash Shock: -20% price gap
    const buyShockDown = simulateShadowFill(buyOrder, { arrivalPrice: 80, latencyMs: 50, stressTier: 'normal' });
    expect(buyShockDown.fillPrice).toBeCloseTo(80.064, 4);
    expect(buyShockDown.slippageBps).toBeCloseTo(-1993.6, 2);

    const sellShockDown = simulateShadowFill(sellOrder, { arrivalPrice: 80, latencyMs: 50, stressTier: 'normal' });
    expect(sellShockDown.fillPrice).toBeCloseTo(79.936, 4);
    expect(sellShockDown.slippageBps).toBeCloseTo(2006.4, 2);

    // Massive flash shock: -99% crash & +500% pump
    const crashFill = simulateShadowFill(buyOrder, { arrivalPrice: 1.0, latencyMs: 100, stressTier: 'extreme' });
    expect(crashFill.fillPrice).toBeCloseTo(1.0085, 4);
    expect(() => ShadowFillSchema.parse(crashFill)).not.toThrow();

    const pumpFill = simulateShadowFill(sellOrder, { arrivalPrice: 600, latencyMs: 100, stressTier: 'extreme' });
    expect(pumpFill.fillPrice).toBeCloseTo(594.9, 4);
    expect(() => ShadowFillSchema.parse(pumpFill)).not.toThrow();
  });

  it('validates exact mathematical correctness of slippageBps across synthetic fixtures', () => {
    // Parity fixtures: arrival == decision -> slippageBps equals tier slipRate * 10,000
    const normalBuy = simulateShadowFill(makeOrder('buy', 100), { arrivalPrice: 100, latencyMs: 10, stressTier: 'normal' });
    expect(normalBuy.slippageBps).toBeCloseTo(8.0, 6);

    const conservativeBuy = simulateShadowFill(makeOrder('buy', 100), { arrivalPrice: 100, latencyMs: 10, stressTier: 'conservative' });
    expect(conservativeBuy.slippageBps).toBeCloseTo(17.0, 6);

    const adverseBuy = simulateShadowFill(makeOrder('buy', 100), { arrivalPrice: 100, latencyMs: 10, stressTier: 'adverse' });
    expect(adverseBuy.slippageBps).toBeCloseTo(40.0, 6);

    const extremeBuy = simulateShadowFill(makeOrder('buy', 100), { arrivalPrice: 100, latencyMs: 10, stressTier: 'extreme' });
    expect(extremeBuy.slippageBps).toBeCloseTo(85.0, 6);

    // Sell parity: identical positive bps
    const normalSell = simulateShadowFill(makeOrder('sell', 100), { arrivalPrice: 100, latencyMs: 10, stressTier: 'normal' });
    expect(normalSell.slippageBps).toBeCloseTo(8.0, 6);

    // Asymmetric price fixture: Buy decision 200, arrival 210 (+5%), extreme tier (0.0085)
    // fillPrice = 210 * 1.0085 = 211.785 -> slippage = ((211.785 - 200)/200) * 10000 = 589.25 bps
    const asymBuy = simulateShadowFill(makeOrder('buy', 200), { arrivalPrice: 210, latencyMs: 10, stressTier: 'extreme' });
    expect(asymBuy.slippageBps).toBeCloseTo(589.25, 4);

    // Asymmetric price fixture: Sell decision 100, arrival 80 (-20%), adverse tier (0.0040)
    // fillPrice = 80 * (1 - 0.0040) = 79.68 -> slippage = -1 * ((79.68 - 100)/100) * 10000 = 2032.0 bps
    const asymSell = simulateShadowFill(makeOrder('sell', 100), { arrivalPrice: 80, latencyMs: 10, stressTier: 'adverse' });
    expect(asymSell.slippageBps).toBeCloseTo(2032.0, 4);

    // Scale invariance: slippageBps at parity is identical regardless of nominal price
    const tinyBuy = simulateShadowFill(makeOrder('buy', 0.00001234), { arrivalPrice: 0.00001234, latencyMs: 5, stressTier: 'normal' });
    const hugeBuy = simulateShadowFill(makeOrder('buy', 1_000_000), { arrivalPrice: 1_000_000, latencyMs: 5, stressTier: 'normal' });
    expect(tinyBuy.slippageBps).toBeCloseTo(8.0, 4);
    expect(hugeBuy.slippageBps).toBeCloseTo(8.0, 4);
  });

  it('enforces schema bounds on max length orderId and fails closed on edge inputs', () => {
    // 100-character orderId (max allowed by schema)
    const longOrderId = 'ord_' + 'a'.repeat(96);
    expect(longOrderId.length).toBe(100);

    const fillWithLongId = simulateShadowFill(makeOrder('buy', 100, 1000, longOrderId), {
      arrivalPrice: 100,
      latencyMs: 10,
      stressTier: 'normal',
    });
    expect(fillWithLongId.fillId.length).toBeLessThanOrEqual(100);
    expect(() => ShadowFillSchema.parse(fillWithLongId)).not.toThrow();

    // Invalid parameters fail closed
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: 0, latencyMs: 10, stressTier: 'normal' })).toThrow(RangeError);
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: Number.NaN, latencyMs: 10, stressTier: 'normal' })).toThrow(RangeError);
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: 100, latencyMs: Number.POSITIVE_INFINITY, stressTier: 'normal' })).toThrow(RangeError);
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: 100, latencyMs: 10, stressTier: 'UNKNOWN' as CostStressTier })).toThrow();
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: 100, latencyMs: 10, stressTier: 'normal', fillTimestampOverride: 0 })).toThrow(RangeError);
    expect(() => simulateShadowFill(makeOrder('buy'), { arrivalPrice: 100, latencyMs: 10, stressTier: 'normal', fillTimestampOverride: 12.5 })).toThrow(RangeError);

    // Batch with keyed orderId parameter lookup
    const orderA = makeOrder('buy', 100, 1000, 'ord_alpha');
    const batchFills = simulateShadowFills([orderA], {
      ord_alpha: { arrivalPrice: 105, latencyMs: 10, stressTier: 'normal' },
    });
    expect(batchFills).toHaveLength(1);
    expect(batchFills[0]!.orderId).toBe('ord_alpha');
  });
});
