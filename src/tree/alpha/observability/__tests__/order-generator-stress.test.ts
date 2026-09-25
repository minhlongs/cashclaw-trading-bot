import { describe, expect, it } from 'vitest';
import { generateShadowOrders } from '../order-generator';
import { ShadowOrderSchema } from '../schemas';

describe('order-generator deep stress & edge conditions', () => {
  const basePrices = { BTC: 50_000, ETH: 3_000, SOL: 150 };
  const baseEquity = 100_000;
  const baseTimestamp = 1_700_000_000_000;

  it('handles 100-symbol portfolio rebalancing with consistent order IDs and sizing', () => {
    const symbols = Array.from({ length: 100 }, (_, i) => `SYM_${i.toString().padStart(3, '0')}`);
    const currentWeights: Record<string, number> = {};
    const targetWeights: Record<string, number> = {};
    const prices: Record<string, number> = {};

    symbols.forEach((sym, i) => {
      currentWeights[sym] = i % 2 === 0 ? 0.01 : 0.02;
      targetWeights[sym] = i % 2 === 0 ? 0.02 : 0.01;
      prices[sym] = 10 + i;
    });

    const orders = generateShadowOrders({
      currentWeights,
      targetWeights,
      prices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    expect(orders).toHaveLength(100);
    // Verify deterministic alphabetical order
    for (let i = 0; i < orders.length; i++) {
      expect(orders[i]?.symbol).toBe(symbols[i]);
      expect(orders[i]?.orderId).toBe(`ord_${symbols[i]}_${baseTimestamp}_${i}`);
      expect(() => ShadowOrderSchema.parse(orders[i])).not.toThrow();
    }
  });

  it('documents omission behavior: symbols omitted from targetWeights are not liquidated', () => {
    // Current portfolio holds BTC, but targetWeights only specifies ETH
    const orders = generateShadowOrders({
      currentWeights: { BTC: 0.5, ETH: 0.1 },
      targetWeights: { ETH: 0.8 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    // Only ETH delta is evaluated because BTC is not in targetWeights
    expect(orders).toHaveLength(1);
    expect(orders[0]?.symbol).toBe('ETH');
    expect(orders[0]?.side).toBe('buy');
    expect(orders[0]?.targetWeightDelta).toBeCloseTo(0.7);

    // To liquidate BTC, targetWeights MUST explicitly specify BTC: 0.0
    const explicitLiquidateOrders = generateShadowOrders({
      currentWeights: { BTC: 0.5, ETH: 0.1 },
      targetWeights: { BTC: 0.0, ETH: 0.8 },
      prices: basePrices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    expect(explicitLiquidateOrders).toHaveLength(2);
    const btcOrder = explicitLiquidateOrders.find((o) => o.symbol === 'BTC');
    expect(btcOrder?.side).toBe('sell');
    expect(btcOrder?.targetWeightDelta).toBeCloseTo(-0.5);
  });

  it('handles maximum length symbol (50 chars) and special characters', () => {
    const longSymbol = 'A'.repeat(50);
    const complexSymbol = 'PERP_BTC/USDT-240927';
    const orders = generateShadowOrders({
      currentWeights: {},
      targetWeights: { [longSymbol]: 0.1, [complexSymbol]: 0.2 },
      prices: { [longSymbol]: 10, [complexSymbol]: 50_000 },
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    expect(orders).toHaveLength(2);
    orders.forEach((o) => expect(() => ShadowOrderSchema.parse(o)).not.toThrow());
  });

  it('maintains strict determinism under 50 random key permutations', () => {
    const baseTarget: Record<string, number> = {
      ADA: 0.1, BTC: 0.2, DOT: 0.15, ETH: 0.25, SOL: 0.2, XRP: 0.1,
    };
    const prices: Record<string, number> = {
      ADA: 0.5, BTC: 50_000, DOT: 5, ETH: 3_000, SOL: 150, XRP: 0.6,
    };

    const reference = generateShadowOrders({
      currentWeights: {},
      targetWeights: baseTarget,
      prices,
      portfolioEquity: baseEquity,
      decisionTimestamp: baseTimestamp,
    });

    const keys = Object.keys(baseTarget);
    for (let run = 0; run < 50; run++) {
      // Shuffle keys
      const shuffled = [...keys].sort(() => Math.random() - 0.5);
      const permutedTarget: Record<string, number> = {};
      shuffled.forEach((k) => {
        permutedTarget[k] = baseTarget[k]!;
      });

      const result = generateShadowOrders({
        currentWeights: {},
        targetWeights: permutedTarget,
        prices,
        portfolioEquity: baseEquity,
        decisionTimestamp: baseTimestamp,
      });

      expect(result).toEqual(reference);
    }
  });
});
