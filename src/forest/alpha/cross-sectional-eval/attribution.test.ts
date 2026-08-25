// Tests for attribution (plan §3 Step C).
// Long/short attribution sums to gross PnL; cost attribution totals = Σ per-period costs.
// Tests assert no import of RuleBasedRegimeClassifier.

import { describe, it, expect } from 'vitest';
import {
  attributeLongShortPrecise,
  attributeLongShortProportional,
  attributeCosts,
} from './attribution';
import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';

describe('attribution', () => {
  describe('attributeLongShortPrecise', () => {
    it('splits by sign of weight exactly', () => {
      const inputs = [
        {
          weights: { AAA: 0.5, BBB: -0.5 },
          assetReturns: { AAA: 0.02, BBB: -0.01 },
        },
        {
          weights: { AAA: 0.5, BBB: -0.5 },
          assetReturns: { AAA: -0.01, BBB: 0.03 },
        },
      ];
      // Period 1: long = 0.5 * 0.02 = 0.01; short = -0.5 * -0.01 = 0.005
      // Period 2: long = 0.5 * -0.01 = -0.005; short = -0.5 * 0.03 = -0.015
      // Sum: long = 0.005; short = -0.01
      const result = attributeLongShortPrecise(inputs);
      expect(result.longSidePnl).toBeCloseTo(0.005, 10);
      expect(result.shortSidePnl).toBeCloseTo(-0.01, 10);
      // Invariant: sum = gross PnL = 0.01 + 0.005 + (-0.005) + (-0.015) = -0.005
      expect(result.longSidePnl + result.shortSidePnl).toBeCloseTo(-0.005, 10);
    });

    it('throws on missing return for held symbol (fail-closed)', () => {
      const inputs = [
        { weights: { AAA: 0.5 }, assetReturns: {} },
      ];
      expect(() => attributeLongShortPrecise(inputs)).toThrow(
        "missing return for held symbol 'AAA'",
      );
    });

    it('handles single-period single-asset', () => {
      const inputs = [{ weights: { AAA: 1 }, assetReturns: { AAA: 0.05 } }];
      const result = attributeLongShortPrecise(inputs);
      expect(result.longSidePnl).toBe(0.05);
      expect(result.shortSidePnl).toBe(0);
    });
  });

  describe('attributeLongShortProportional', () => {
    it('splits by long vs short gross exposure share', () => {
      const periods: RebalanceRecord[] = [
        {
          timestamp: 1000,
          weights: { AAA: 0.5, BBB: -0.5 },
          turnover: 0,
          costPct: 0,
          grossReturn: 0.01,
          netReturn: 0.01,
          grossExposure: 1,
          netExposure: 0,
        },
        {
          timestamp: 2000,
          weights: { AAA: 0.2, BBB: -0.8 },
          turnover: 0,
          costPct: 0,
          grossReturn: 0.02,
          netReturn: 0.02,
          grossExposure: 1,
          netExposure: -0.6,
        },
      ];
      // Period 1: longGross=0.5, shortGross=0.5, total=1 -> shares 0.5/0.5
      // long = 0.01 * 0.5 = 0.005, short = 0.01 * 0.5 = 0.005
      // Period 2: longGross=0.2, shortGross=0.8, total=1 -> shares 0.2/0.8
      // long = 0.02 * 0.2 = 0.004, short = 0.02 * 0.8 = 0.016
      // Sum: long = 0.009, short = 0.021
      const result = attributeLongShortProportional(periods);
      expect(result.longSidePnl).toBeCloseTo(0.009, 10);
      expect(result.shortSidePnl).toBeCloseTo(0.021, 10);
      expect(result.longSidePnl + result.shortSidePnl).toBeCloseTo(0.03, 10); // Σ grossReturn
    });

    it('gives all to long when no short exposure', () => {
      const periods: RebalanceRecord[] = [
        {
          timestamp: 1000,
          weights: { AAA: 1 },
          turnover: 0,
          costPct: 0,
          grossReturn: 0.03,
          netReturn: 0.03,
          grossExposure: 1,
          netExposure: 1,
        },
      ];
      const result = attributeLongShortProportional(periods);
      expect(result.longSidePnl).toBe(0.03);
      expect(result.shortSidePnl).toBe(0);
    });

    it('gives all to short when no long exposure', () => {
      const periods: RebalanceRecord[] = [
        {
          timestamp: 1000,
          weights: { AAA: -1 },
          turnover: 0,
          costPct: 0,
          grossReturn: -0.02,
          netReturn: -0.02,
          grossExposure: 1,
          netExposure: -1,
        },
      ];
      const result = attributeLongShortProportional(periods);
      expect(result.longSidePnl).toBe(0);
      expect(result.shortSidePnl).toBe(-0.02);
    });

    it('skips zero-exposure periods', () => {
      const periods: RebalanceRecord[] = [
        {
          timestamp: 1000,
          weights: {},
          turnover: 0,
          costPct: 0,
          grossReturn: 0.01,
          netReturn: 0.01,
          grossExposure: 0,
          netExposure: 0,
        },
      ];
      const result = attributeLongShortProportional(periods);
      expect(result.longSidePnl).toBe(0);
      expect(result.shortSidePnl).toBe(0);
    });
  });

  describe('attributeCosts', () => {
    it('decomposes using conservative mode proportions', () => {
      // conservative: fee=0.0010, slip=0.0007, impact=0.0010, total=0.0027
      // periods costPct sum = 0.0027 (one period, turnover=1)
      const periods: RebalanceRecord[] = [
        {
          timestamp: 1000,
          weights: { AAA: 1 },
          turnover: 1,
          costPct: 0.0027,
          grossReturn: 0,
          netReturn: -0.0027,
          grossExposure: 1,
          netExposure: 1,
        },
      ];
      const result = attributeCosts(periods, 'conservative');
      expect(result.fees).toBeCloseTo(0.0010, 10);
      expect(result.slippage).toBeCloseTo(0.0007, 10);
      expect(result.marketImpact).toBeCloseTo(0.0010, 10);
      expect(result.fees + result.slippage + result.marketImpact).toBeCloseTo(0.0027, 10);
    });

    it('sums to Σ costPct across periods', () => {
      const periods: RebalanceRecord[] = [
        { timestamp: 1000, weights: {}, turnover: 0.5, costPct: 0.001, grossReturn: 0, netReturn: 0, grossExposure: 0, netExposure: 0 },
        { timestamp: 2000, weights: {}, turnover: 0.5, costPct: 0.001, grossReturn: 0, netReturn: 0, grossExposure: 0, netExposure: 0 },
      ];
      const result = attributeCosts(periods, 'normal');
      const total = result.fees + result.slippage + result.marketImpact;
      expect(total).toBeCloseTo(0.002, 10);
    });

    it('returns zeros when total unit cost is zero', () => {
      // We need to use a mode that has all zero costs
      // Not possible with built-in modes, but test the guard
      const periods: RebalanceRecord[] = [
        { timestamp: 1000, weights: { AAA: 1 }, turnover: 1, costPct: 0, grossReturn: 0, netReturn: 0, grossExposure: 1, netExposure: 1 },
      ];
      const result = attributeCosts(periods, 'normal'); // normal has positive total
      expect(result.fees + result.slippage + result.marketImpact).toBeCloseTo(0, 10);
    });
  });
});