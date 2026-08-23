// Multiple-Testing Defense — Cross-Asset Consistency Tests
// Covers: empty input → consistent:false; assetsTested < minAssets → false;
// 1 asset pass rest fail → false; all pass ≥ minAssets → true

import { describe, expect, it } from 'vitest';
import { assessCrossAssetConsistency } from './cross-asset-consistency';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { CrossAssetConsistencyOptions } from './types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Helpers ──────────────────────────────────────────────
function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    experimentId: 'test-exp',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    regime: RegimeLabel.RANGE,
    totalReturn: 100,
    netPnl: 100,
    cagr: 0.5,
    winRate: 0.55,
    lossRate: 0.45,
    profitFactor: 1.5,
    expectancy: 0.02,
    sharpe: 1.2,
    sortino: 1.5,
    maxDrawdown: 0.1,
    avgTrade: 0.5,
    medianTrade: 0.4,
    numTrades: 200,
    turnover: 2,
    fees: 10,
    slippage: 5,
    exposure: 0.8,
    recoveryFactor: 2,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
    ...overrides,
  };
}

describe('assessCrossAssetConsistency', () => {
  const baseOptions: CrossAssetConsistencyOptions = {
    minPositiveFraction: 0.5,
    minAssets: 3,
  };

  describe('happy path', () => {
    it('all assets pass → consistent:true', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0.04 }),
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsTested).toBe(3);
      expect(result.assetsPassed).toBe(3);
      expect(result.positiveFraction).toBe(1);
      expect(result.consistent).toBe(true);
    });

    it('meets minPositiveFraction → consistent:true', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: -0.01 }), // one fail
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsTested).toBe(3);
      expect(result.assetsPassed).toBe(2);
      expect(result.positiveFraction).toBeCloseTo(0.666, 2);
      expect(result.consistent).toBe(true); // 2/3 >= 0.5
    });

    it('exactly minAssets tested and all pass → consistent:true', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0.04 }),
      ];
      const result = assessCrossAssetConsistency(reports, { minPositiveFraction: 0.5, minAssets: 3 });
      expect(result.assetsTested).toBe(3);
      expect(result.consistent).toBe(true);
    });
  });

  describe('fail-closed: empty input throws', () => {
    it('empty reports array throws', () => {
      expect(() => assessCrossAssetConsistency([], baseOptions)).toThrow(
        'assessCrossAssetConsistency requires at least 1 report',
      );
    });
  });

  describe('fail-closed: below minAssets throws', () => {
    it('reports.length < minAssets throws', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
      ];
      expect(() => assessCrossAssetConsistency(reports, baseOptions)).toThrow(
        'assessCrossAssetConsistency requires at least 3 reports, got 2',
      );
    });

    it('minAssets = 1 with 1 report passes breadth check', () => {
      const reports = [makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 })];
      const result = assessCrossAssetConsistency(reports, { minPositiveFraction: 0.5, minAssets: 1 });
      expect(result.assetsTested).toBe(1);
      expect(result.assetsPassed).toBe(1);
      expect(result.consistent).toBe(true);
    });
  });

  describe('failure cases', () => {
    it('1 asset pass rest fail → consistent:false', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: -0.02 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: -0.01 }),
        makeReport({ symbol: 'ADAUSDT', expectancy: -0.03 }),
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsTested).toBe(4);
      expect(result.assetsPassed).toBe(1);
      expect(result.positiveFraction).toBe(0.25);
      expect(result.consistent).toBe(false);
    });

    it('all assets fail → consistent:false', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: -0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: -0.02 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: -0.01 }),
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsPassed).toBe(0);
      expect(result.positiveFraction).toBe(0);
      expect(result.consistent).toBe(false);
    });

    it('below minPositiveFraction → consistent:false', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: -0.02 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: -0.01 }),
      ];
      const result = assessCrossAssetConsistency(reports, { minPositiveFraction: 0.8, minAssets: 3 });
      expect(result.assetsPassed).toBe(1);
      expect(result.positiveFraction).toBeCloseTo(0.333, 2);
      expect(result.consistent).toBe(false);
    });
  });

  describe('option validation', () => {
    it('minPositiveFraction < 0 throws', () => {
      const reports = [makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 })];
      expect(() => assessCrossAssetConsistency(reports, { ...baseOptions, minPositiveFraction: -0.1 })).toThrow(
        'minPositiveFraction must be in [0, 1], got -0.1',
      );
    });

    it('minPositiveFraction > 1 throws', () => {
      const reports = [makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 })];
      expect(() => assessCrossAssetConsistency(reports, { ...baseOptions, minPositiveFraction: 1.1 })).toThrow(
        'minPositiveFraction must be in [0, 1], got 1.1',
      );
    });

    it('minAssets < 1 throws', () => {
      const reports = [makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 })];
      expect(() => assessCrossAssetConsistency(reports, { ...baseOptions, minAssets: 0 })).toThrow(
        'minAssets must be an integer >= 1, got 0',
      );
    });

    it('minAssets non-integer throws', () => {
      const reports = [makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 })];
      expect(() => assessCrossAssetConsistency(reports, { ...baseOptions, minAssets: 1.5 })).toThrow(
        'minAssets must be an integer >= 1, got 1.5',
      );
    });
  });

  describe('edge cases', () => {
    it('zero expectancy is not positive', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0 }),
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsPassed).toBe(0);
      expect(result.consistent).toBe(false);
    });

    it('negative expectancy is not positive', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: -0.001 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.01 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0.02 }),
      ];
      const result = assessCrossAssetConsistency(reports, baseOptions);
      expect(result.assetsPassed).toBe(2);
      expect(result.positiveFraction).toBeCloseTo(0.666, 2);
      expect(result.consistent).toBe(true);
    });

    it('non-finite expectancy throws', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: NaN }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.01 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0.02 }),
      ];
      expect(() => assessCrossAssetConsistency(reports, baseOptions)).toThrow(
        'Report test-exp has non-finite expectancy',
      );
    });

    it('minPositiveFraction = 1 requires all assets pass', () => {
      const reports = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: 0.04 }),
      ];
      const result = assessCrossAssetConsistency(reports, { minPositiveFraction: 1, minAssets: 3 });
      expect(result.consistent).toBe(true);

      const reports2 = [
        makeReport({ symbol: 'BTCUSDT', expectancy: 0.05 }),
        makeReport({ symbol: 'ETHUSDT', expectancy: 0.03 }),
        makeReport({ symbol: 'SOLUSDT', expectancy: -0.01 }),
      ];
      const result2 = assessCrossAssetConsistency(reports2, { minPositiveFraction: 1, minAssets: 3 });
      expect(result2.consistent).toBe(false);
    });
  });
});