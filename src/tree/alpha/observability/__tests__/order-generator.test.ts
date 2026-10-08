import { describe, expect, it } from 'vitest';
import { generateShadowOrders } from '../order-generator';
import { ShadowOrderSchema } from '../schemas';

describe('order-generator', () => {
  const basePrices = { BTC: 50_000, ETH: 3_000, SOL: 150 };
  const baseEquity = 100_000;
  const baseTimestamp = 1_700_000_000_000;

  it('generates correct buy and sell shadow orders from weight deltas', () => {
    const orders = generateShadowOrders({
      currentWeights: { BTC: 0.2, ETH: 0.5 },
      targetWeights: { BTC: 0.5, ETH: 0.2 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    expect(orders).toHaveLength(2);

    const btcOrder = orders.find((o) => o.symbol === 'BTC');
    expect(btcOrder).toBeDefined();
    expect(btcOrder?.side).toBe('buy');
    expect(btcOrder?.size).toBeCloseTo(30_000);
    expect(btcOrder?.price).toBe(50_000);
    expect(btcOrder?.targetWeightDelta).toBeCloseTo(0.3);
    expect(btcOrder?.decisionTimestamp).toBe(baseTimestamp);

    const ethOrder = orders.find((o) => o.symbol === 'ETH');
    expect(ethOrder).toBeDefined();
    expect(ethOrder?.side).toBe('sell');
    expect(ethOrder?.size).toBeCloseTo(30_000);
    expect(ethOrder?.price).toBe(3_000);
    expect(ethOrder?.targetWeightDelta).toBeCloseTo(-0.3);

    orders.forEach((o) => expect(() => ShadowOrderSchema.parse(o)).not.toThrow());
  });

  it('suppresses orders below default and custom epsilon threshold', () => {
    const defaultSuppressed = generateShadowOrders({
      currentWeights: { BTC: 0.1 },
      targetWeights: { BTC: 0.1 + 5e-7 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });
    expect(defaultSuppressed).toHaveLength(0);

    const customThresholdOrders = generateShadowOrders({
      currentWeights: { BTC: 0.1, ETH: 0.1 },
      targetWeights: { BTC: 0.105, ETH: 0.12 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
      minWeightDeltaThreshold: 0.01,
    });
    expect(customThresholdOrders).toHaveLength(1);
    expect(customThresholdOrders[0]?.symbol).toBe('ETH');
  });

  it('preserves zero weight change invariance', () => {
    const orders = generateShadowOrders({
      currentWeights: { BTC: 0.4, ETH: 0.6 },
      targetWeights: { BTC: 0.4, ETH: 0.6 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });
    expect(orders).toHaveLength(0);
  });

  it('defaults missing current weights to zero', () => {
    const orders = generateShadowOrders({
      currentWeights: { BTC: 0.2 },
      targetWeights: { BTC: 0.2, SOL: 0.15 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.symbol).toBe('SOL');
    expect(orders[0]?.side).toBe('buy');
    expect(orders[0]?.targetWeightDelta).toBeCloseTo(0.15);
    expect(orders[0]?.size).toBeCloseTo(15_000);
  });

  it('handles multi-asset portfolio rebalancing with deterministic order IDs', () => {
    const orders = generateShadowOrders({
      currentWeights: { BTC: 0.1, ETH: 0.4, SOL: 0.1 },
      targetWeights: { BTC: 0.3, ETH: 0.1, SOL: 0.2 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });
    expect(orders).toHaveLength(3);
    expect(orders.map((o) => o.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(orders[0]?.orderId).toBe(`ord_BTC_${baseTimestamp}_0`);
    expect(orders[1]?.orderId).toBe(`ord_ETH_${baseTimestamp}_1`);
    expect(orders[2]?.orderId).toBe(`ord_SOL_${baseTimestamp}_2`);
  });

  it('filters out non-positive or missing prices without throwing', () => {
    const orders = generateShadowOrders({
      currentWeights: {},
      targetWeights: { BTC: 0.2, ETH: 0.2, SOL: 0.2, UNK: 0.2 },
      prices: { BTC: 50_000, ETH: 0, SOL: -150 },
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.symbol).toBe('BTC');
  });

  it('throws RangeError or TypeError on invalid equity or timestamps', () => {
    expect(() =>
      generateShadowOrders({
        currentWeights: {},
        targetWeights: { BTC: 0.5 },
        prices: basePrices,
        portfolioEquity: 0,
        decisionTimestamp: baseTimestamp,
      }),
    ).toThrow(RangeError);

    expect(() =>
      generateShadowOrders({
        currentWeights: {},
        targetWeights: { BTC: 0.5 },
        prices: basePrices,
        portfolioEquity: -50_000,
        decisionTimestamp: baseTimestamp,
      }),
    ).toThrow(RangeError);

    expect(() =>
      generateShadowOrders({
        currentWeights: {},
        targetWeights: { BTC: 0.5 },
        prices: basePrices,
        portfolioEquity: baseEquity,
        decisionTimestamp: -1,
      }),
    ).toThrow(RangeError);

    expect(() =>
      generateShadowOrders({
        currentWeights: {},
        targetWeights: { BTC: 0.5 },
        prices: basePrices,
        portfolioEquity: baseEquity,
        decisionTimestamp: 1.5,
      }),
    ).toThrow(RangeError);
  });
});
