import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  computeBatchSlippageAttribution,
  computeEdgeAttribution,
  computeSlippageAttribution,
} from '../attribution';
import type { CostStressTier, ShadowFill } from '../types';

const makeFill = (overrides: Partial<ShadowFill> = {}): ShadowFill => ({
  fillId: 'fill-adv-1', orderId: 'ord-1', symbol: 'BTC/USDT', side: 'buy',
  fillPrice: 50000, fillQuantity: 1, fillTimestamp: 1000, feeAmount: 5,
  slippageBps: 3.0, stressTier: 'normal', ...overrides,
});

describe('Attribution Adversarial Challenge (P8-M3)', () => {
  describe('Delta Edge Math: Boundary & Extreme Conditions', () => {
    it('computes exact zero delta edge when realized exactly matches expectation', () => {
      const res = computeEdgeAttribution({ expectedReturn: 0.035, expectedCost: 0.005, realizedNetReturn: 0.030 });
      expect(res.expectedNetReturn).toBe(0.030);
      expect(res.realizedNetReturn).toBe(0.030);
      expect(res.deltaEdge).toBe(0);
    });

    it('handles zero expected cost correctly (both explicit 0 and undefined)', () => {
      const explicitZero = computeEdgeAttribution({ expectedReturn: 0.045, expectedCost: 0, realizedNetReturn: 0.045 });
      expect(explicitZero.expectedCost).toBe(0);
      expect(explicitZero.expectedNetReturn).toBe(0.045);
      expect(explicitZero.deltaEdge).toBe(0);

      const omittedCost = computeEdgeAttribution({ expectedReturn: 0.045, realizedNetReturn: 0.045 });
      expect(omittedCost.expectedCost).toBe(0);
      expect(omittedCost.expectedNetReturn).toBe(0.045);
      expect(omittedCost.deltaEdge).toBe(0);
    });

    it('handles zero expected return and zero realized net return without falsy fallback bug', () => {
      const res = computeEdgeAttribution({ expectedReturn: 0, expectedCost: 0.002, realizedNetReturn: 0 });
      expect(res.expectedReturn).toBe(0);
      expect(res.expectedNetReturn).toBe(-0.002);
      expect(res.realizedNetReturn).toBe(0);
      expect(res.deltaEdge).toBe(0.002);
    });

    it('computes massive positive delta edge on extreme outlier winner alpha', () => {
      const res = computeEdgeAttribution({ expectedReturn: 0.02, expectedCost: 0.005, realizedNetReturn: 1.50 });
      expect(res.expectedNetReturn).toBe(0.015);
      expect(res.realizedNetReturn).toBe(1.50);
      expect(res.deltaEdge).toBe(1.485);
    });

    it('computes massive negative delta edge on catastrophic liquidation / short squeeze', () => {
      // Buy side wipeout (asset drops to 0, realized = -100%)
      const buyWipeout = computeEdgeAttribution({
        expectedReturn: 0.05, expectedCost: 0.01, entryPrice: 100, exitPrice: 0, side: 'buy', feePct: 0.001,
      });
      expect(buyWipeout.expectedNetReturn).toBe(0.04);
      expect(buyWipeout.realizedNetReturn).toBe(-1.001); // -100% gross - 0.1% fee
      expect(buyWipeout.deltaEdge).toBe(-1.041);

      // Sell side short squeeze (asset surges 3x, realized = -200%)
      const shortSqueeze = computeEdgeAttribution({
        expectedReturn: 0.03, expectedCost: 0.005, entryPrice: 100, exitPrice: 300, side: 'sell', feePct: 0.002,
      });
      expect(shortSqueeze.expectedNetReturn).toBe(0.025);
      expect(shortSqueeze.realizedNetReturn).toBe(-2.002); // -200% gross - 0.2% fee
      expect(shortSqueeze.deltaEdge).toBe(-2.027);
    });

    it('preserves 8-decimal precision on micro-alpha variations without float drift', () => {
      const res = computeEdgeAttribution({ expectedReturn: 0.00000015, expectedCost: 0.00000005, realizedNetReturn: 0.00000020 });
      expect(res.expectedNetReturn).toBe(0.0000001);
      expect(res.realizedNetReturn).toBe(0.0000002);
      expect(res.deltaEdge).toBe(0.0000001);
    });

    it('fails closed on missing return inputs', () => {
      expect(() => computeEdgeAttribution({} as unknown as { expectedReturn: number })).toThrow(/expectedReturn is required/);
      expect(() => computeEdgeAttribution({ expectedReturn: 0.01 })).toThrow(/Must provide realizedNetReturn or entryPrice and exitPrice/);
    });
  });

  describe('Mark-to-Market Buy & Sell Return Math with Fees', () => {
    it('accurately computes buy mark-to-market with notional fee deduction', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.03, expectedCost: 0.002, entryPrice: 200, exitPrice: 220,
        side: 'buy', feeAmount: 25, fillNotional: 25000,
      });
      expect(res.expectedNetReturn).toBe(0.028);
      // gross: (220 - 200)/200 = +0.10. fee: 25/25000 = 0.001 (0.1%). net: 0.099
      expect(res.realizedNetReturn).toBe(0.099);
      expect(res.deltaEdge).toBe(0.071);
    });

    it('accurately computes profitable sell mark-to-market with feePct deduction', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.04, expectedCost: 0.005, entryPrice: 200, exitPrice: 160,
        side: 'sell', feePct: 0.0015,
      });
      expect(res.expectedNetReturn).toBe(0.035);
      // gross: (200 - 160)/200 = +0.20. fee: 0.0015. net: 0.1985
      expect(res.realizedNetReturn).toBe(0.1985);
      expect(res.deltaEdge).toBe(0.1635);
    });

    it('handles zero notional gracefully by falling back to feePct without division by zero', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.02, entryPrice: 100, exitPrice: 102,
        side: 'buy', feeAmount: 5, fillNotional: 0, feePct: 0.0005,
      });
      // fillNotional === 0 falls back to feePct 0.0005
      expect(res.realizedNetReturn).toBe(0.0195);
      expect(res.deltaEdge).toBe(-0.0005);
    });

    it('respects side resolution from record direction when side parameter is omitted', () => {
      const res = computeEdgeAttribution({
        record: {
          alphaId: 'short-alpha', direction: 'sell', confidence: 0.9,
          expectedReturn: 0.05, expectedCost: 0.01, expectedTurnover: 1,
          regime: RegimeLabel.TREND_DOWN, horizon: '1h', featureDependencies: ['rsi'],
          featureSnapshotHash: 'a'.repeat(64) as unknown as import('../types').FeatureSnapshotHash,
          timestamp: 1000,
        },
        entryPrice: 100, exitPrice: 95, feePct: 0.001,
      });
      // direction: 'sell' -> gross: (100 - 95)/100 = +0.05. fee: 0.001. net: 0.049
      expect(res.realizedNetReturn).toBe(0.049);
      expect(res.expectedNetReturn).toBe(0.04);
      expect(res.deltaEdge).toBe(0.009);
    });
  });

  describe('Slippage Attribution Across 4 Cost Tiers: Price Improvement vs Adverse Slippage', () => {
    const tiers: readonly { tier: CostStressTier; expectedBps: number }[] = [
      { tier: 'normal', expectedBps: 3.0 },
      { tier: 'conservative', expectedBps: 7.0 },
      { tier: 'adverse', expectedBps: 20.0 },
      { tier: 'extreme', expectedBps: 40.0 },
    ];

    it.each(tiers)('evaluates price improvement on tier %s', ({ tier, expectedBps }) => {
      // Realized slippage is negative (executed better than mid by 4 bps)
      const fillImprovement = makeFill({ stressTier: tier, slippageBps: -4.0 });
      const resImprovement = computeSlippageAttribution(fillImprovement);
      expect(resImprovement.expectedSlippageBps).toBe(expectedBps);
      expect(resImprovement.realizedSlippageBps).toBe(-4.0);
      expect(resImprovement.deltaSlippageBps).toBe(Number((-4.0 - expectedBps).toFixed(4)));

      // Realized slippage is 0 bps (zero impact/slippage)
      const fillZero = makeFill({ stressTier: tier, slippageBps: 0.0 });
      const resZero = computeSlippageAttribution(fillZero);
      expect(resZero.deltaSlippageBps).toBe(Number((0.0 - expectedBps).toFixed(4)));
    });

    it.each(tiers)('evaluates severe adverse slippage on tier %s', ({ tier, expectedBps }) => {
      const fillAdverse = makeFill({ stressTier: tier, slippageBps: expectedBps + 35.0 });
      const resAdverse = computeSlippageAttribution(fillAdverse);
      expect(resAdverse.expectedSlippageBps).toBe(expectedBps);
      expect(resAdverse.realizedSlippageBps).toBe(expectedBps + 35.0);
      expect(resAdverse.deltaSlippageBps).toBe(35.0);
    });

    it('aggregates multi-tier batch with mixed price improvement and adverse fills', () => {
      const batchFills: readonly ShadowFill[] = [
        makeFill({ fillId: 'f-norm-imp', stressTier: 'normal', side: 'buy', slippageBps: -2.0 }), // exp 3, delta -5
        makeFill({ fillId: 'f-norm-adv', stressTier: 'normal', side: 'sell', slippageBps: 8.0 }), // exp 3, delta +5
        makeFill({ fillId: 'f-cons-adv', stressTier: 'conservative', side: 'buy', slippageBps: 14.0 }), // exp 7, delta +7
        makeFill({ fillId: 'f-adv-imp', stressTier: 'adverse', side: 'sell', slippageBps: 10.0 }), // exp 20, delta -10
        makeFill({ fillId: 'f-ext-adv', stressTier: 'extreme', side: 'buy', slippageBps: 60.0 }), // exp 40, delta +20
      ];
      const res = computeBatchSlippageAttribution(batchFills);
      expect(res.count).toBe(5);
      expect(res.byStressTier.normal.count).toBe(2);
      expect(res.byStressTier.normal.meanDeltaSlippageBps).toBe(0.0);
      expect(res.byStressTier.conservative.meanDeltaSlippageBps).toBe(7.0);
      expect(res.byStressTier.adverse.meanDeltaSlippageBps).toBe(-10.0);
      expect(res.byStressTier.extreme.meanDeltaSlippageBps).toBe(20.0);
      expect(res.bySide.buy.count).toBe(3);
      expect(res.bySide.sell.count).toBe(2);
    });
  });
});
