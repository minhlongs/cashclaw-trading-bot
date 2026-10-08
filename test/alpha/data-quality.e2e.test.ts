import { describe, expect, it } from 'vitest';
import {
  evaluateDataQuality,
  generateDataQualityReport,
  protectSignalGeneration,
} from '@/forest/alpha/data-quality-eval';
import { generateMonotonicCandles } from './data-quality-fixtures';
import { registerTier1FeatureCoverageTests } from './tier1-feature-coverage';
import { registerTier2BoundaryCornerTests } from './tier2-boundary-corners';
import { registerTier3PairwiseTests } from './tier3-pairwise-combinations';
import { registerTier4RealWorldTests } from './tier4-real-world-scenarios';

describe('Alpha Research OS Phase 10: 4-Tier Data Quality E2E Test Suite', () => {
  describe('Master Suite: Tier 1 Feature Coverage', () => {
    registerTier1FeatureCoverageTests();
  });

  describe('Master Suite: Tier 2 Boundary & Corner Cases', () => {
    registerTier2BoundaryCornerTests();
  });

  describe('Master Suite: Tier 3 Pairwise Combinations', () => {
    registerTier3PairwiseTests();
  });

  describe('Master Suite: Tier 4 Real-World Market Topology Scenarios', () => {
    registerTier4RealWorldTests();
  });

  describe('End-to-End Pipeline Integration & Report Generation', () => {
    it('executes full pipeline producing valid assessment and markdown report', () => {
      const candles = generateMonotonicCandles(10);
      const report = evaluateDataQuality({
        series: candles,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: candles[9].timestamp,
      });
      expect(report.status).toBe('VALID');
      expect(report.summary.passedChecks).toBe(report.summary.totalChecks);
      expect(report.summary.failedChecks).toBe(0);
      expect(report.summary.violationCount).toBe(0);

      const markdown = generateDataQualityReport(report);
      expect(markdown).toContain('# Data Quality Assessment Report');
      expect(markdown).toContain('BTC/USDT');
      expect(markdown).toContain('VALID');
    });

    it('verifies fail-closed halt in end-to-end signal production pipeline', () => {
      const corrupted = generateMonotonicCandles(10);
      corrupted[4] = { ...corrupted[4], high: 50, low: 60 };
      const result = protectSignalGeneration(
        { series: corrupted, symbol: 'SOL/USDT', timeframe: '1m' },
        () => 'ALPHA_SIGNAL_EXECUTE',
      );
      expect(result.status).toBe('DATA_INVALID');
      expect(result.signal).toBeNull();
      expect(result.report.summary.failedChecks).toBeGreaterThanOrEqual(1);

      const markdown = generateDataQualityReport(result.report);
      expect(markdown).toContain('DATA_INVALID');
      expect(markdown).toContain('impossible_ohlc');
    });
  });
});
