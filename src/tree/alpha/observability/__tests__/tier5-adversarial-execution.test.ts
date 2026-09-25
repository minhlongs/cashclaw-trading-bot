import { describe, expect, it } from 'vitest';
import * as TypesModule from '../types';
import { generateShadowOrders } from '../order-generator';
import { simulateShadowFill, simulateShadowFills, type SimulateShadowFillParams } from '../shadow-simulator';
import type { CostStressTier, ShadowOrder } from '../types';

describe('Tier 5 Adversarial Hardening — Execution & Types', () => {
  it('loads types module for full contract surface', () => {
    expect(TypesModule).toBeDefined();
    expect(typeof TypesModule).toBe('object');
  });

  describe('generateShadowOrders adversarial boundary checks', () => {
    const baseParams = {
      currentWeights: { BTC: 0.1 },
      targetWeights: { BTC: 0.2 },
      prices: { BTC: 50_000 },
      portfolioEquity: 100_000,
      decisionTimestamp: 1_700_000_000_000,
    };

    it('rejects invalid minWeightDeltaThreshold (negative, NaN, Infinity)', () => {
      expect(() =>
        generateShadowOrders({ ...baseParams, minWeightDeltaThreshold: -0.001 }),
      ).toThrow(RangeError);
      expect(() =>
        generateShadowOrders({ ...baseParams, minWeightDeltaThreshold: Number.NaN }),
      ).toThrow(RangeError);
      expect(() =>
        generateShadowOrders({ ...baseParams, minWeightDeltaThreshold: Number.POSITIVE_INFINITY }),
      ).toThrow(RangeError);
    });

    it('gracefully handles missing optional maps or undefined weights/prices', () => {
      const emptyParams = {
        currentWeights: undefined as unknown as Record<string, number>,
        targetWeights: undefined as unknown as Record<string, number>,
        prices: undefined as unknown as Record<string, number>,
        portfolioEquity: 50_000,
        decisionTimestamp: 1_700_000_000_000,
      };
      expect(generateShadowOrders(emptyParams)).toEqual([]);

      const noCurrent = generateShadowOrders({
        currentWeights: undefined as unknown as Record<string, number>,
        targetWeights: { BTC: 0.25 },
        prices: { BTC: 40_000 },
        portfolioEquity: 10_000,
        decisionTimestamp: 1_700_000_000_000,
      });
      expect(noCurrent).toHaveLength(1);
      expect(noCurrent[0]?.targetWeightDelta).toBe(0.25);
    });

    it('skips symbols with non-finite target, non-finite current, or zero delta', () => {
      const orders = generateShadowOrders({
        currentWeights: { A: 0.2, B: Number.NaN, C: 0.5 },
        targetWeights: {
          A: Number.NaN,
          B: 0.3,
          C: 0.5, // delta = 0
          D: Number.POSITIVE_INFINITY,
        },
        prices: { A: 10, B: 20, C: 30, D: 40 },
        portfolioEquity: 10_000,
        decisionTimestamp: 1_700_000_000_000,
      });
      expect(orders).toHaveLength(0);
    });

    it('skips symbols with invalid, non-positive, or missing reference prices', () => {
      const orders = generateShadowOrders({
        currentWeights: { A: 0, B: 0, C: 0, D: 0 },
        targetWeights: { A: 0.1, B: 0.1, C: 0.1, D: 0.1 },
        prices: { A: 0, B: -25, C: Number.NaN }, // D missing
        portfolioEquity: 10_000,
        decisionTimestamp: 1_700_000_000_000,
      });
      expect(orders).toHaveLength(0);
    });

    it('exercises rawOrderId truncation and rejects symbol exceeding max schema length', () => {
      const veryLongSymbol = 'LONG_'.repeat(25);
      expect(() =>
        generateShadowOrders({
          currentWeights: { [veryLongSymbol]: 0 },
          targetWeights: { [veryLongSymbol]: 0.1 },
          prices: { [veryLongSymbol]: 100 },
          portfolioEquity: 10_000,
          decisionTimestamp: 1_700_000_000_000,
        }),
      ).toThrow();
    });
  });

  describe('simulateShadowFill and simulateShadowFills adversarial checks', () => {
    const validOrder: ShadowOrder = {
      orderId: 'ord_btc_1001',
      symbol: 'BTC/USDT',
      side: 'buy',
      size: 50_000,
      price: 50_000,
      targetWeightDelta: 0.5,
      decisionTimestamp: 1_700_000_000_000,
    };

    const simParams: SimulateShadowFillParams = {
      arrivalPrice: 50_100,
      latencyMs: 15,
      stressTier: 'conservative',
    };

    it('rejects invalid orders and paramsMap inputs in simulateShadowFill and simulateShadowFills', () => {
      expect(() => simulateShadowFill(validOrder, null as unknown as SimulateShadowFillParams)).toThrow(TypeError);
      expect(() => simulateShadowFill(validOrder, 42 as unknown as SimulateShadowFillParams)).toThrow(TypeError);
      expect(() =>
        simulateShadowFills('not-an-array' as unknown as readonly ShadowOrder[], simParams),
      ).toThrow(TypeError);
      expect(() =>
        simulateShadowFills(null as unknown as readonly ShadowOrder[], simParams),
      ).toThrow(TypeError);
      expect(() =>
        simulateShadowFills([validOrder], null as unknown as SimulateShadowFillParams),
      ).toThrow(TypeError);
      expect(() =>
        simulateShadowFills([validOrder], 'not-object' as unknown as SimulateShadowFillParams),
      ).toThrow(TypeError);
    });

    it('routes parameters by orderId fallback when symbol is absent from map', () => {
      const paramsByOrderId: Record<string, SimulateShadowFillParams> = {
        ord_btc_1001: { arrivalPrice: 50_050, latencyMs: 20, stressTier: 'normal' },
      };
      const fills = simulateShadowFills([validOrder], paramsByOrderId);
      expect(fills).toHaveLength(1);
      expect(fills[0]?.orderId).toBe('ord_btc_1001');
      expect(fills[0]?.stressTier).toBe('normal');
    });

    it('throws descriptive error if simulation params missing for an order', () => {
      const emptyParamsMap: Record<string, SimulateShadowFillParams> = {};
      expect(() => simulateShadowFills([validOrder], emptyParamsMap)).toThrow(
        /missing simulation params for order ord_btc_1001/,
      );
    });

    it('validates fillTimestampOverride strictly (positive integer only)', () => {
      expect(() =>
        simulateShadowFill(validOrder, { ...simParams, fillTimestampOverride: 0 }),
      ).toThrow(RangeError);
      expect(() =>
        simulateShadowFill(validOrder, { ...simParams, fillTimestampOverride: -100 }),
      ).toThrow(RangeError);
      expect(() =>
        simulateShadowFill(validOrder, { ...simParams, fillTimestampOverride: 1.5 }),
      ).toThrow(RangeError);
      expect(() =>
        simulateShadowFill(validOrder, { ...simParams, fillTimestampOverride: Number.NaN }),
      ).toThrow(RangeError);

      const customTimestamp = 1_700_000_123_456;
      const fill = simulateShadowFill(validOrder, {
        ...simParams,
        fillTimestampOverride: customTimestamp,
      });
      expect(fill.fillTimestamp).toBe(customTimestamp);

      expect(() =>
        simulateShadowFill(validOrder, {
          ...simParams,
          stressTier: 999 as unknown as CostStressTier,
        }),
      ).toThrow();
    });

    it('truncates fillId if composite rawFillId exceeds 100 characters', () => {
      const longOrder: ShadowOrder = {
        ...validOrder,
        orderId: 'x'.repeat(95),
      };
      const fill = simulateShadowFill(longOrder, simParams);
      expect(fill.fillId.length).toBe(100);
      expect(fill.fillId.startsWith('fill_xxxxxxxx')).toBe(true);
    });
  });
});
