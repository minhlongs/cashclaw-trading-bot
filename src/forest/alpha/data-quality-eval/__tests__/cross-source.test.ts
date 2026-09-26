import { describe, expect, it } from 'vitest';
import { evaluateDataQuality } from '../evaluate';
import type { Candle, DataQualityEvalInput } from '../types';

function createValidCandles(
  count: number = 6,
  intervalMs: number = 60_000,
  startEpoch: number = 1_700_000_000_000,
): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: startEpoch + i * intervalMs,
    open: 100 + i,
    high: 110 + i,
    low: 95 + i,
    close: 105 + i,
    volume: 1000 + i * 50,
  }));
}

describe('Cross-Source Feed Alignment Evaluation', () => {
  const baseTime = 1_700_000_000_000;
  const interval = 60_000;

  it('passes when secondarySeries timestamps are identical to primary feed', () => {
    const primary = createValidCandles(6, interval, baseTime);
    const secondary = createValidCandles(6, interval, baseTime);

    const input: DataQualityEvalInput = {
      series: primary,
      secondarySeries: secondary,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTime + 7 * interval,
    };

    const report = evaluateDataQuality(input);

    expect(report.status).toBe('VALID');
    const alignmentCheck = report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignmentCheck?.passed).toBe(true);
    expect(alignmentCheck?.violations.length).toBe(0);
  });

  it('passes when timestamp drift is within toleranceMs', () => {
    const primary = createValidCandles(6, interval, baseTime);
    // 500ms offset, well within 2000ms tolerance
    const secondary = primary.map((c) => ({
      ...c,
      timestamp: c.timestamp + 500,
    }));

    const report = evaluateDataQuality(
      {
        series: primary,
        secondarySeries: secondary,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 7 * interval,
      },
      {
        alignment: { toleranceMs: 2000 },
      },
    );

    expect(report.status).toBe('VALID');
    const alignmentCheck = report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignmentCheck?.passed).toBe(true);
  });

  it('fails with DATA_INVALID when timestamp drift exceeds toleranceMs', () => {
    const primary = createValidCandles(6, interval, baseTime);
    // 3000ms offset exceeds 1000ms tolerance
    const secondary = primary.map((c) => ({
      ...c,
      timestamp: c.timestamp + 3000,
    }));

    const report = evaluateDataQuality(
      {
        series: primary,
        secondarySeries: secondary,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 7 * interval,
      },
      {
        alignment: { toleranceMs: 1000, maxUnmatchedCandles: 0 },
      },
    );

    expect(report.status).toBe('DATA_INVALID');
    const alignmentCheck = report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignmentCheck?.passed).toBe(false);
    expect(alignmentCheck?.violations.length).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.includes('secondary feed'))).toBe(true);
  });

  it('fails when secondary feed is empty while primary feed has candles', () => {
    const primary = createValidCandles(5, interval, baseTime);
    const secondary: Candle[] = [];

    const report = evaluateDataQuality({
      series: primary,
      secondarySeries: secondary,
      symbol: 'ETH/USDT',
      timeframe: '1m',
      asOf: baseTime + 6 * interval,
    });

    expect(report.status).toBe('DATA_INVALID');
    const alignmentCheck = report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignmentCheck?.passed).toBe(false);
  });

  it('passes alignment check if secondarySeries is not provided', () => {
    const primary = createValidCandles(5, interval, baseTime);

    const report = evaluateDataQuality({
      series: primary,
      symbol: 'SOL/USDT',
      timeframe: '1m',
      asOf: baseTime + 6 * interval,
    });

    expect(report.status).toBe('VALID');
    const alignmentCheck = report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignmentCheck?.passed).toBe(true);
  });
});
