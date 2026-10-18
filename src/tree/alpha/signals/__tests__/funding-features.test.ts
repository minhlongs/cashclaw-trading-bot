import { describe, it, expect } from 'vitest';
import { rollingMean, rollingStd, fundingFields, oiFields, liquidationFields, basisFields } from '../funding';

describe('funding.ts — rolling statistics', () => {
  describe('rollingMean', () => {
    it('returns null when fewer values than window', () => { expect(rollingMean([1, 2], 3)).toBeNull(); });
    it('computes mean of last window values', () => { expect(rollingMean([1, 2, 3, 4, 5], 3)).toBe(4); });
    it('handles single value window', () => { expect(rollingMean([10], 1)).toBe(10); });
    it('handles all same values', () => { expect(rollingMean([5, 5, 5, 5], 2)).toBe(5); });
  });

  describe('rollingStd', () => {
    it('returns null when fewer values than window', () => { expect(rollingStd([1, 2], 3)).toBeNull(); });
    it('computes std of last window values', () => { expect(rollingStd([1, 2, 4], 2)).toBe(1); });
    it('returns 0 when all values equal', () => { expect(rollingStd([5, 5, 5], 2)).toBe(0); });
    it('handles single value window', () => { expect(rollingStd([10], 1)).toBe(0); });
  });
});

describe('funding.ts — feature computation helpers', () => {
  describe('fundingFields', () => {
    it('returns nulls when no funding history', () => {
      const result = fundingFields([], 1000);
      expect(result.fundingRate).toBeNull();
      expect(result.fundingRateAvg8h).toBeNull();
      expect(result.fundingRateSlope).toBeNull();
    });

    it('returns latest fundingRate', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      ];
      const result = fundingFields(funding, 200);
      expect(result.fundingRate).toBe(0.0002);
    });

    it('computes 8h average (3 periods)', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      const result = fundingFields(funding, 300);
      expect(result.fundingRateAvg8h).toBeCloseTo(0.0002, 6);
    });

    it('computes slope when >= 3 points', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      const result = fundingFields(funding, 300);
      expect(result.fundingRateSlope).toBeCloseTo(0.0002, 10);
    });

    it('returns null slope when < 3 points', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
      ];
      const result = fundingFields(funding, 200);
      expect(result.fundingRateSlope).toBeNull();
    });

    it('filters by timestamp <= t (causal)', () => {
      const funding = [
        { timestamp: 100, symbol: 'BTC', fundingRate: 0.0001, markPrice: 50000 },
        { timestamp: 200, symbol: 'BTC', fundingRate: 0.0002, markPrice: 51000 },
        { timestamp: 300, symbol: 'BTC', fundingRate: 0.0003, markPrice: 52000 },
      ];
      const result = fundingFields(funding, 200);
      expect(result.fundingRate).toBe(0.0002);
      expect(result.fundingRateAvg8h).toBeNull();
    });
  });

  describe('oiFields', () => {
    it('returns nulls when no OI history', () => {
      const result = oiFields([], 1000, 20);
      expect(result.openInterest).toBeNull();
      expect(result.oiChange).toBeNull();
      expect(result.oiZScore).toBeNull();
    });

    it('filters out null notionalUsd', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: null },
        { timestamp: 300, symbol: 'BTC', openInterest: 3000, notionalUsd: 150000000 },
      ];
      const result = oiFields(oi, 300, 20);
      expect(result.openInterest).toBe(150000000);
    });

    it('computes oiChange when >= 2 valid points', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 200, 20);
      expect(result.oiChange).toBe(1.0);
    });

    it('returns null oiChange when < 2 valid points', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: null },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 200, 20);
      expect(result.oiChange).toBeNull();
    });

    it('computes oiZScore when >= lookbackBars', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
        { timestamp: 300, symbol: 'BTC', openInterest: 3000, notionalUsd: 150000000 },
      ];
      const result = oiFields(oi, 300, 3);
      expect(result.oiZScore).not.toBeNull();
    });

    it('returns null oiZScore when < lookbackBars', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
      ];
      const result = oiFields(oi, 100, 20);
      expect(result.oiZScore).toBeNull();
    });

    it('filters by timestamp <= t (causal)', () => {
      const oi = [
        { timestamp: 100, symbol: 'BTC', openInterest: 1000, notionalUsd: 50000000 },
        { timestamp: 200, symbol: 'BTC', openInterest: 2000, notionalUsd: 100000000 },
      ];
      const result = oiFields(oi, 150, 20);
      expect(result.openInterest).toBe(50000000);
    });
  });

  describe('liquidationFields and basisFields', () => {
    it('computes imbalance and zScore', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 1000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 2, notionalUsd: 100000 },
      ];
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(100000);
      expect(result.liquidationZScore).not.toBeNull();
    });

    it('handles only long liquidations', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'long' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      ];
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(100000);
      expect(result.liquidationZScore).toBeNull();
    });

    it('handles only short liquidations', () => {
      const liquidations = [
        { timestamp: 1000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
        { timestamp: 2000, symbol: 'BTC', side: 'short' as const, price: 50000, quantity: 1, notionalUsd: 50000 },
      ];
      const result = liquidationFields(liquidations, 2000, 3, 4 * 3_600_000);
      expect(result.liquidationImbalance).toBe(-100000);
      expect(result.liquidationZScore).toBeNull();
    });

    it('finds latest basis point <= t and computes zScore', () => {
      const premiumIndex = [
        { timestamp: 100, basis: 0.001 },
        { timestamp: 200, basis: 0.002 },
        { timestamp: 300, basis: 0.003 },
      ];
      const result = basisFields(premiumIndex, 250, 20);
      expect(result.basis).toBe(0.002);

      const zScoreRes = basisFields(premiumIndex, 300, 3);
      expect(zScoreRes.basisZScore).not.toBeNull();
    });
  });
});
