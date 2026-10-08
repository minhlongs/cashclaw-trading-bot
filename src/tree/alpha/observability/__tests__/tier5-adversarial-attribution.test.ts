import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
  computeEdgeAttribution,
  computeSlippageAttribution,
} from '../attribution';
import type { AlphaDecisionRecord, ShadowFill } from '../types';

describe('Tier 5 Adversarial Hardening — Attribution', () => {
  const dummyHash = 'a'.repeat(64) as AlphaDecisionRecord['featureSnapshotHash'];

  const sampleRecord: AlphaDecisionRecord = {
    alphaId: 'alpha-arb-01',
    direction: 'buy',
    confidence: 0.9,
    expectedReturn: 0.005,
    expectedCost: 0.001,
    expectedTurnover: 0.2,
    regime: RegimeLabel.TREND_UP,
    horizon: '1h',
    featureDependencies: ['feat1'],
    featureSnapshotHash: dummyHash,
    timestamp: 1_700_000_000_000,
  };

  const sampleFill: ShadowFill = {
    fillId: 'fill_001',
    orderId: 'ord_001',
    symbol: 'ETH/USDT',
    side: 'buy',
    fillPrice: 2005,
    fillQuantity: 10,
    fillTimestamp: 1_700_000_005_000,
    feeAmount: 2.005,
    slippageBps: 25,
    stressTier: 'normal',
  };

  describe('computeEdgeAttribution dispatch and boundary handling', () => {
    it('dispatches single record vs batch array correctly', () => {
      const single = computeEdgeAttribution({ record: sampleRecord, realizedNetReturn: 0.006 });
      expect(single.deltaEdge).toBe(0.002);

      const batch = computeEdgeAttribution([
        { record: sampleRecord, realizedNetReturn: 0.006 },
        { record: sampleRecord, realizedNetReturn: 0.003 },
      ]);
      expect(batch.count).toBe(2);
      expect(batch.meanRealizedNetReturn).toBe(0.0045);
    });

    it('handles empty edge attribution batch returning zeroes and empty groups', () => {
      const empty = computeBatchEdgeAttribution([]);
      expect(empty.count).toBe(0);
      expect(empty.meanDeltaEdge).toBe(0);
      expect(empty.records).toHaveLength(0);
    });

    it('groups records with undefined alphaId and regime as unknown', () => {
      const result = computeBatchEdgeAttribution([
        { expectedReturn: 0.01, expectedCost: 0.002, realizedNetReturn: 0.012 },
      ]);
      expect(result.byAlphaId['unknown']?.count).toBe(1);
      expect(result.byRegime['unknown']?.count).toBe(1);
    });

    it('throws when expectedReturn cannot be derived from params or record', () => {
      expect(() => computeEdgeAttribution({ realizedNetReturn: 0.01 })).toThrow(
        /expectedReturn is required/,
      );
    });

    it('throws when neither realizedNetReturn nor entry/exit prices are provided', () => {
      expect(() => computeEdgeAttribution({ expectedReturn: 0.01 })).toThrow(
        /Must provide realizedNetReturn or entryPrice and exitPrice/,
      );
    });

    it('derives realizedNetReturn from entry/exit prices across sell, buy, and fee configurations', () => {
      // Sell direction inferred from record
      const sellRec: AlphaDecisionRecord = { ...sampleRecord, direction: 'sell' };
      const sellRes = computeEdgeAttribution({
        record: sellRec,
        entryPrice: 100,
        exitPrice: 90,
        feeAmount: 5,
        fillNotional: 1000,
      });
      expect(sellRes.realizedNetReturn).toBe(0.095);

      // Buy direction defaulted when record omitted and side omitted
      const buyRes = computeEdgeAttribution({
        expectedReturn: 0.05,
        entryPrice: 100,
        exitPrice: 110,
        feePct: 0.002,
      });
      expect(buyRes.realizedNetReturn).toBe(0.098);

      // Zero fee rate when both fillNotional fee and feePct are omitted
      const zeroFee = computeEdgeAttribution({
        expectedReturn: 0.05,
        entryPrice: 100,
        exitPrice: 105,
        fillNotional: 0,
      });
      expect(zeroFee.realizedNetReturn).toBe(0.05);
    });

    it('defaults expectedCost to 0 when both param and record expectedCost are absent', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.04,
        realizedNetReturn: 0.05,
      });
      expect(res.expectedCost).toBe(0);
      expect(res.expectedNetReturn).toBe(0.04);
      expect(res.deltaEdge).toBe(0.01);
    });
  });

  describe('computeSlippageAttribution dispatch and empty handling', () => {
    it('dispatches single fill vs batch fills correctly', () => {
      const single = computeSlippageAttribution(sampleFill);
      expect(single.fillId).toBe('fill_001');

      const batch = computeSlippageAttribution([sampleFill]);
      expect(batch.count).toBe(1);
    });

    it('handles empty fills array without division by zero', () => {
      const empty = computeBatchSlippageAttribution([]);
      expect(empty.count).toBe(0);
      expect(empty.meanRealizedSlippageBps).toBe(0);
      expect(empty.meanExpectedSlippageBps).toBe(0);
      expect(empty.meanDeltaSlippageBps).toBe(0);
      expect(empty.byStressTier.normal.count).toBe(0);
      expect(empty.byStressTier.normal.meanRealizedSlippageBps).toBe(0);
      expect(empty.bySide.buy.count).toBe(0);
      expect(empty.bySide.buy.meanRealizedSlippageBps).toBe(0);
    });
  });
});
