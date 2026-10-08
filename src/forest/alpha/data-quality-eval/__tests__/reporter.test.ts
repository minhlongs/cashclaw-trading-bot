import { describe, expect, it } from 'vitest';
import { generateDataQualityReport } from '../reporter';
import type { DataQualityAssessmentReport } from '../types';

describe('Markdown Diagnostic Reporter', () => {
  it('generates report for clean data with zero violations', () => {
    const report: DataQualityAssessmentReport = {
      status: 'VALID',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      evaluatedAt: 1_700_000_000_000,
      validationResult: {
        valid: true,
        status: 'VALID',
        checkResults: [
          { dimension: 'timestamp_monotonicity', passed: true, violations: [] },
          { dimension: 'impossible_ohlc', passed: true, violations: [] },
        ],
        violations: [],
        totalCandles: 100,
      },
      summary: {
        totalChecks: 2,
        passedChecks: 2,
        failedChecks: 0,
        violationCount: 0,
      },
      recommendations: ['Data quality is valid.'],
    };

    const md = generateDataQualityReport(report);
    expect(md).toContain('# Data Quality Assessment Report');
    expect(md).toContain('| Symbol | **BTC/USDT** |');
    expect(md).toContain('| Status | **VALID** |');
    expect(md).toContain('No data quality violations detected.');
    expect(md).toContain('- Data quality is valid.');
  });

  it('generates detailed violation blocks with index, timestamp, and actual values', () => {
    const report: DataQualityAssessmentReport = {
      status: 'DATA_INVALID',
      symbol: 'ETH/USDT',
      timeframe: '5m',
      evaluatedAt: 1_700_000_000_000,
      validationResult: {
        valid: false,
        status: 'DATA_INVALID',
        checkResults: [
          {
            dimension: 'missing_intervals',
            passed: false,
            violations: [
              {
                dimension: 'missing_intervals',
                message: 'Gap detected',
                index: 5,
                timestamp: 1_700_000_300_000,
                details: { expectedIntervalMs: 300_000, actualGapMs: 900_000, missingCount: 2 },
              },
            ],
          },
          {
            dimension: 'impossible_ohlc',
            passed: false,
            violations: [
              {
                dimension: 'impossible_ohlc',
                message: 'Invalid price values',
                details: { reason: 'high_below_low' },
              },
            ],
          },
        ],
        violations: [
          {
            dimension: 'missing_intervals',
            message: 'Gap detected',
            index: 5,
            timestamp: 1_700_000_300_000,
            details: { expectedIntervalMs: 300_000, actualGapMs: 900_000, missingCount: 2 },
          },
          {
            dimension: 'impossible_ohlc',
            message: 'Invalid price values',
            details: { reason: 'high_below_low' },
          },
        ],
        totalCandles: 50,
      },
      summary: {
        totalChecks: 2,
        passedChecks: 0,
        failedChecks: 2,
        violationCount: 2,
      },
      recommendations: ['Fill missing gaps', 'Cleanse corrupted OHLC'],
    };

    const md = generateDataQualityReport(report);
    expect(md).toContain('### Violation 1: `missing_intervals`');
    expect(md).toContain('- **Index**: 5');
    expect(md).toContain('- **actualGapMs**: `900000`');
    expect(md).toContain('### Violation 2: `impossible_ohlc`');
    expect(md).toContain('- **Index**: N/A');
    expect(md).toContain('- **Timestamp**: N/A');
    expect(md).toContain('- **reason**: `"high_below_low"`');
  });

  it('handles invalid date epoch gracefully without crashing', () => {
    const report: DataQualityAssessmentReport = {
      status: 'DATA_INVALID',
      symbol: 'SOL/USDT',
      timeframe: '1m',
      evaluatedAt: 1_700_000_000_000,
      validationResult: {
        valid: false,
        status: 'DATA_INVALID',
        checkResults: [],
        violations: [
          {
            dimension: 'timestamp_monotonicity',
            message: 'Bad epoch',
            timestamp: 1e16, // Invalid date
            details: {},
          },
        ],
        totalCandles: 1,
      },
      summary: { totalChecks: 1, passedChecks: 0, failedChecks: 1, violationCount: 1 },
      recommendations: [],
    };

    const md = generateDataQualityReport(report);
    expect(md).toContain('10000000000000000');
  });
});
