import { describe, expect, it } from 'vitest';
import { evaluateDataQuality } from '../evaluate';
import { DataQualityAssessmentReportSchema } from '../schemas';
import type { Candle, DataQualityEvalInput } from '../types';

function createValidCandles(
  count: number = 10,
  intervalMs: number = 60_000,
  startEpoch: number = 1_700_000_000_000,
): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: startEpoch + i * intervalMs,
    open: 100 + (i % 3),
    high: 110 + (i % 3),
    low: 95 + (i % 3),
    close: 105 + (i % 3),
    volume: 1000 + i * 50,
  }));
}

describe('evaluateDataQuality Seam', () => {
  const baseTime = 1_700_000_000_000;
  const interval = 60_000;

  it('evaluates clean series as VALID with all 9 checks passing', () => {
    const candles = createValidCandles(10, interval, baseTime);
    const input: DataQualityEvalInput = {
      series: candles,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 9 * interval + 10_000,
    };

    const report = evaluateDataQuality(input);

    expect(report.status).toBe('VALID');
    expect(report.validationResult.valid).toBe(true);
    expect(report.summary.totalChecks).toBe(9);
    expect(report.summary.passedChecks).toBe(9);
    expect(report.summary.failedChecks).toBe(0);
    expect(report.summary.violationCount).toBe(0);
    expect(report.recommendations[0]).toContain('Data quality is valid');
    expect(DataQualityAssessmentReportSchema.parse(report)).toBeDefined();
  });

  it('detects monotonicity and duplicate violations as DATA_INVALID', () => {
    const candles = createValidCandles(5, interval, baseTime);
    candles[2] = { ...candles[1] }; // duplicate timestamp

    const report = evaluateDataQuality({
      series: candles,
      symbol: 'ETH/USDT',
      timeframe: '1m',
      asOf: baseTime + 10 * interval,
    });

    expect(report.status).toBe('DATA_INVALID');
    expect(report.summary.failedChecks).toBeGreaterThanOrEqual(1);
    expect(report.recommendations.some((r) => r.includes('Deduplicate'))).toBe(true);
  });

  it('detects impossible OHLC relationships and volume anomalies', () => {
    const candles = createValidCandles(5, interval, baseTime);
    candles[1] = { ...candles[1], high: 50, low: 120 }; // high < low
    candles[3] = { ...candles[3], volume: -100 }; // negative volume

    const report = evaluateDataQuality({
      series: candles,
      symbol: 'SOL/USDT',
      timeframe: '1m',
      asOf: baseTime + 10 * interval,
    });

    expect(report.status).toBe('DATA_INVALID');
    const failedDims = report.validationResult.checkResults
      .filter((c) => !c.passed)
      .map((c) => c.dimension);
    expect(failedDims).toContain('impossible_ohlc');
    expect(failedDims).toContain('volume_anomalies');
    expect(report.recommendations.some((r) => r.includes('OHLC'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('Sanitize volume'))).toBe(true);
  });

  it('detects stale data and future data contamination', () => {
    const candles = createValidCandles(5, interval, baseTime);
    // asOf earlier than last candle -> future data
    const futureReport = evaluateDataQuality({
      series: candles,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 2 * interval,
    });
    expect(futureReport.status).toBe('DATA_INVALID');
    expect(
      futureReport.validationResult.violations.some((v) => v.dimension === 'future_data'),
    ).toBe(true);

    const staleReport = evaluateDataQuality(
      {
        series: candles,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 500 * interval,
      },
      { staleness: { asOf: baseTime + 500 * interval, maxStaleIntervals: 2 } },
    );
    expect(staleReport.status).toBe('DATA_INVALID');
    expect(staleReport.validationResult.violations.some((v) => v.dimension === 'stale_data')).toBe(
      true,
    );
  });

  it('detects exchange outages when identical consecutive bars exceed threshold', () => {
    const candles = createValidCandles(8, interval, baseTime);
    for (let i = 2; i < 7; i++) {
      candles[i] = { ...candles[1], timestamp: baseTime + i * interval };
    }

    const report = evaluateDataQuality(
      {
        series: candles,
        symbol: 'AVAX/USDT',
        timeframe: '1m',
        asOf: baseTime + 8 * interval,
      },
      { outage: { maxConsecutiveIdenticalBars: 4 } },
    );

    expect(report.status).toBe('DATA_INVALID');
    expect(
      report.validationResult.violations.some((v) => v.dimension === 'exchange_outage'),
    ).toBe(true);
    expect(report.recommendations.some((r) => r.includes('exchange freeze'))).toBe(true);
  });

  it('supports custom config overrides for enabledDimensions and generatedAt', () => {
    const candles = createValidCandles(5, interval, baseTime);
    candles[1] = { ...candles[1], high: 50, low: 120 }; // impossible OHLC

    // If impossible_ohlc is excluded from enabledDimensions, it will not run
    const report = evaluateDataQuality(
      {
        series: candles,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 6 * interval,
      },
      {
        enabledDimensions: ['timestamp_monotonicity', 'duplicate_candles'],
        generatedAt: 1_700_999_999_000,
      },
    );

    expect(report.status).toBe('VALID');
    expect(report.summary.totalChecks).toBe(2);
    expect(report.summary.passedChecks).toBe(2);
    expect(report.evaluatedAt).toBe(1_700_999_999_000);
  });

  it('falls back to current time when asOf and generatedAt are omitted', () => {
    const candles = createValidCandles(5, interval, baseTime);
    const before = Date.now();
    const report = evaluateDataQuality({
      series: candles,
      symbol: 'BTC/USDT',
      timeframe: '1m',
    });
    const after = Date.now();

    expect(report.evaluatedAt).toBeGreaterThanOrEqual(before);
    expect(report.evaluatedAt).toBeLessThanOrEqual(after);
  });

  it('throws TypeError on invalid series input', () => {
    expect(() =>
      evaluateDataQuality({
        series: null as unknown as Candle[],
        symbol: 'BTC/USDT',
        timeframe: '1m',
      }),
    ).toThrow(TypeError);
  });
});
