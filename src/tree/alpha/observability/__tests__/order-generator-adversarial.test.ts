import { describe, expect, it } from 'vitest';
import { generateShadowOrders, type GenerateShadowOrdersParams } from '../order-generator';
import { ShadowOrderSchema } from '../schemas';

describe('order-generator adversarial & empirical stress', () => {
  const basePrices = { BTC: 50_000, ETH: 3_000, SOL: 150 };
  const baseEquity = 100_000;
  const baseTimestamp = 1_700_000_000_000;

  describe('extreme weight deltas', () => {
    it('handles full liquidation (-1.0 delta) correctly', () => {
      const [order] = generateShadowOrders({
        currentWeights: { BTC: 1.0 }, targetWeights: { BTC: 0.0 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(order?.symbol).toBe('BTC');
      expect(order?.side).toBe('sell');
      expect(order?.targetWeightDelta).toBe(-1.0);
      expect(order?.size).toBe(100_000);
      expect(order?.price).toBe(50_000);
      expect(order?.decisionTimestamp).toBe(baseTimestamp);
      expect(() => ShadowOrderSchema.parse(order)).not.toThrow();
    });

    it('handles full long (+1.0 delta) correctly', () => {
      const [order] = generateShadowOrders({
        currentWeights: { ETH: 0.0 }, targetWeights: { ETH: 1.0 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(order?.symbol).toBe('ETH');
      expect(order?.side).toBe('buy');
      expect(order?.targetWeightDelta).toBe(1.0);
      expect(order?.size).toBe(100_000);
      expect(order?.price).toBe(3_000);
      expect(() => ShadowOrderSchema.parse(order)).not.toThrow();
    });

    it('handles leveraged allocation (+2.0 delta and beyond) with large equity ($10B)', () => {
      const largeEquity = 10_000_000_000;
      const orders = generateShadowOrders({
        currentWeights: { SOL: -0.5 }, targetWeights: { SOL: 1.5, BTC: 2.0 },
        prices: basePrices, portfolioEquity: largeEquity, decisionTimestamp: baseTimestamp,
      });
      expect(orders).toHaveLength(2);
      const btc = orders.find((o) => o.symbol === 'BTC');
      const sol = orders.find((o) => o.symbol === 'SOL');
      expect(btc?.side).toBe('buy');
      expect(btc?.targetWeightDelta).toBe(2.0);
      expect(btc?.size).toBe(2.0 * largeEquity);
      expect(sol?.side).toBe('buy');
      expect(sol?.targetWeightDelta).toBe(2.0);
      expect(sol?.size).toBe(2.0 * largeEquity);
      orders.forEach((o) => expect(() => ShadowOrderSchema.parse(o)).not.toThrow());
    });
  });

  describe('epsilon boundaries', () => {
    it('suppresses deltas strictly below threshold (1e-7)', () => {
      const orders = generateShadowOrders({
        currentWeights: { BTC: 0.0, ETH: 0.0 }, targetWeights: { BTC: 1e-7, ETH: -1e-7 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(orders).toHaveLength(0);
    });

    it('generates orders at exactly default threshold (1e-6)', () => {
      const orders = generateShadowOrders({
        currentWeights: { BTC: 0.0, ETH: 0.0 }, targetWeights: { BTC: 1e-6, ETH: -1e-6 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(orders).toHaveLength(2);
      const btc = orders.find((o) => o.symbol === 'BTC');
      const eth = orders.find((o) => o.symbol === 'ETH');
      expect(btc?.side).toBe('buy');
      expect(btc?.targetWeightDelta).toBe(1e-6);
      expect(btc?.size).toBeCloseTo(0.1);
      expect(eth?.side).toBe('sell');
      expect(eth?.targetWeightDelta).toBe(-1e-6);
      expect(eth?.size).toBeCloseTo(0.1);
      orders.forEach((o) => expect(() => ShadowOrderSchema.parse(o)).not.toThrow());
    });

    it('generates orders above threshold (1e-5) and supports custom threshold (0)', () => {
      const normal = generateShadowOrders({
        currentWeights: { BTC: 0.0 }, targetWeights: { BTC: 1e-5 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(normal).toHaveLength(1);
      expect(normal[0]?.targetWeightDelta).toBe(1e-5);
      expect(normal[0]?.size).toBeCloseTo(1.0);

      const zeroThresh = generateShadowOrders({
        currentWeights: { BTC: 0.0 }, targetWeights: { BTC: 1e-12 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
        minWeightDeltaThreshold: 0,
      });
      expect(zeroThresh).toHaveLength(1);
      expect(zeroThresh[0]?.targetWeightDelta).toBe(1e-12);
    });
  });

  describe('robustness on corrupt feeds', () => {
    it('filters out missing symbols, NaN, negative, zero, and infinite prices without throwing', () => {
      const orders = generateShadowOrders({
        currentWeights: {},
        targetWeights: { VALID: 0.1, MISSING: 0.1, NAN: 0.1, NEG: 0.1, ZERO: 0.1, INF: 0.1 },
        prices: { VALID: 100, NAN: Number.NaN, NEG: -50, ZERO: 0, INF: Number.POSITIVE_INFINITY },
        portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]?.symbol).toBe('VALID');
      expect(orders[0]?.size).toBe(10_000);
      expect(orders[0]?.price).toBe(100);
    });

    it('filters out corrupt weights (NaN, Infinity) cleanly', () => {
      const orders = generateShadowOrders({
        currentWeights: { BTC: Number.NaN },
        targetWeights: { BTC: 0.5, ETH: Number.POSITIVE_INFINITY, SOL: 0.2 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]?.symbol).toBe('SOL');
    });

    it('rejects invalid equity, timestamps, and invalid params with appropriate errors', () => {
      const badEqs = [0, -1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
      for (const eq of badEqs) {
        expect(() => generateShadowOrders({
          currentWeights: {}, targetWeights: { BTC: 0.5 },
          prices: basePrices, portfolioEquity: eq, decisionTimestamp: baseTimestamp,
        })).toThrow(RangeError);
      }
      const badTs = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
      for (const ts of badTs) {
        expect(() => generateShadowOrders({
          currentWeights: {}, targetWeights: { BTC: 0.5 },
          prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: ts,
        })).toThrow(RangeError);
      }
      expect(() => generateShadowOrders(null as unknown as GenerateShadowOrdersParams)).toThrow(TypeError);
      expect(() => generateShadowOrders('bad' as unknown as GenerateShadowOrdersParams)).toThrow(TypeError);
    });
  });

  describe('zero forward-looking bias & determinism', () => {
    it('strictly locks order timestamp and price to decision time', () => {
      const pastTime = 1_000_000_000_000;
      const snapshotPrice = 42_123.45;
      const orders = generateShadowOrders({
        currentWeights: {}, targetWeights: { BTC: 0.25 },
        prices: { BTC: snapshotPrice }, portfolioEquity: 200_000, decisionTimestamp: pastTime,
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]?.decisionTimestamp).toBe(pastTime);
      expect(orders[0]?.price).toBe(snapshotPrice);
    });

    it('guarantees deterministic symbol ordering regardless of input key order', () => {
      const p1 = {
        currentWeights: {}, targetWeights: { SOL: 0.1, BTC: 0.2, ETH: 0.3 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      };
      const p2 = {
        currentWeights: {}, targetWeights: { BTC: 0.2, ETH: 0.3, SOL: 0.1 },
        prices: basePrices, portfolioEquity: baseEquity, decisionTimestamp: baseTimestamp,
      };
      expect(generateShadowOrders(p1)).toEqual(generateShadowOrders(p2));
      expect(generateShadowOrders(p1).map((o) => o.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    });
  });
});
