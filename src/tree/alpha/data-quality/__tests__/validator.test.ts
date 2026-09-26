import { describe, expect, it } from 'vitest';
import { validateCandleSeries } from '../validator';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateCandleSeries (Composite Validator)', () => {
  it('returns VALID when all 9 dimensions pass on clean data', () => {
    const baseTs = 1_700_000_000_000;
    const series = makeSeries(10, 60_000, baseTs);
    const result = validateCandleSeries(series, {
      timeframe: '1m',
      asOf: baseTs + 10 * 60_000,
    });

    expect(result.valid).toBe(true);
    expect(result.status).toBe('VALID');
    expect(result.violations).toHaveLength(0);
    expect(result.checkResults).toHaveLength(9);
    expect(result.totalCandles).toBe(10);
  });

  it('fails closed with DATA_INVALID on non-monotonic timestamps', () => {
    const series = [
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateCandleSeries(series);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'timestamp_monotonicity')).toBe(true);
  });

  it('fails closed with DATA_INVALID on duplicate candles', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateCandleSeries(series);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'duplicate_candles')).toBe(true);
  });

  it('fails closed with DATA_INVALID on missing interval gap', () => {
    const series = [
      makeCandle({ timestamp: 0 }),
      makeCandle({ timestamp: 60_000 }),
      makeCandle({ timestamp: 300_000 }),
    ];
    const result = validateCandleSeries(series, { timeframe: '1m' });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'missing_intervals')).toBe(true);
  });

  it('respects root expectedIntervalMs config', () => {
    const series = [
      makeCandle({ timestamp: 0 }),
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 4_000 }),
    ];
    const result = validateCandleSeries(series, { expectedIntervalMs: 1_000 });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.dimension === 'missing_intervals')).toBe(true);
  });

  it('fails closed with DATA_INVALID on stale feed', () => {
    const series = [makeCandle({ timestamp: 1_000 })];
    const result = validateCandleSeries(series, {
      asOf: 1_000_000,
      staleness: { maxStalenessMs: 10_000, asOf: 1_000_000 },
    });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'stale_data')).toBe(true);
  });

  it('respects sub-config asOf for staleness and future data', () => {
    const series = [makeCandle({ timestamp: 5_000 })];
    const staleResult = validateCandleSeries(series, {
      staleness: { asOf: 100_000, maxStalenessMs: 10_000 },
    });
    expect(staleResult.valid).toBe(false);
    expect(staleResult.violations.some((v) => v.dimension === 'stale_data')).toBe(true);

    const futureResult = validateCandleSeries(series, {
      futureData: { asOf: 1_000 },
    });
    expect(futureResult.valid).toBe(false);
    expect(futureResult.violations.some((v) => v.dimension === 'future_data')).toBe(true);
  });

  it('fails closed with DATA_INVALID on impossible OHLC prices', () => {
    const series = [makeCandle({ open: 100, high: 90, low: 80, close: 95 })];
    const result = validateCandleSeries(series);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'impossible_ohlc')).toBe(true);
  });

  it('fails closed with DATA_INVALID on negative volume', () => {
    const series = [makeCandle({ volume: -50 })];
    const result = validateCandleSeries(series);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'volume_anomalies')).toBe(true);
  });

  it('fails closed with DATA_INVALID on cross-source alignment drift', () => {
    const primary = [makeCandle({ timestamp: 1_000 })];
    const secondary = [makeCandle({ timestamp: 5_000 })];
    const result = validateCandleSeries(primary, { alignment: { toleranceMs: 500 } }, secondary);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'cross_source_alignment')).toBe(true);
  });

  it('fails closed with DATA_INVALID on future-data lookahead', () => {
    const series = [makeCandle({ timestamp: 2_000_000 })];
    const result = validateCandleSeries(series, { asOf: 1_000_000 });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'future_data')).toBe(true);
  });

  it('fails closed with DATA_INVALID on exchange outage frozen feed', () => {
    const flat = { open: 100, high: 105, low: 95, close: 102, volume: 500 };
    const series = [
      makeCandle({ timestamp: 1_000, ...flat }),
      makeCandle({ timestamp: 2_000, ...flat }),
      makeCandle({ timestamp: 3_000, ...flat }),
    ];
    const result = validateCandleSeries(series);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.dimension === 'exchange_outage')).toBe(true);
  });

  it('aggregates multiple violations across dimensions', () => {
    const series = [
      makeCandle({ timestamp: 2_000, volume: -10 }),
      makeCandle({ timestamp: 1_000, open: 200, high: 100 }),
    ];
    const result = validateCandleSeries(series, { asOf: 1_500 });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('runs only enabled dimensions when configured', () => {
    const series = [
      makeCandle({ timestamp: 2_000, volume: -10 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateCandleSeries(series, {
      enabledDimensions: ['volume_anomalies'],
    });
    expect(result.checkResults).toHaveLength(1);
    expect(result.checkResults[0].dimension).toBe('volume_anomalies');
    expect(result.violations).toHaveLength(1);
  });

  it('fails closed with DATA_INVALID without crashing on invalid timeframe string', () => {
    const series = makeSeries(5);
    const result = validateCandleSeries(series, { timeframe: 'bad_cadence' });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.some((v) => v.message.includes('Invalid timeframe format'))).toBe(true);
  });
});
