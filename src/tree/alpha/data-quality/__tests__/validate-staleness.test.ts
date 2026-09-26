import { describe, expect, it } from 'vitest';
import { validateStaleness } from '../validate-staleness';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateStaleness (D4)', () => {
  it('passes on fresh data within maxStalenessMs', () => {
    const series = makeSeries(5, 60_000, 1_000_000); // latest at 1_240_000
    const result = validateStaleness(series, {
      asOf: 1_250_000,
      maxStalenessMs: 60_000,
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('stale_data');
  });

  it('fails on stale data exceeding maxStalenessMs', () => {
    const series = makeSeries(5, 60_000, 1_000_000); // latest at 1_240_000
    const result = validateStaleness(series, {
      asOf: 1_500_000,
      maxStalenessMs: 60_000,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.stalenessMs).toBe(260_000);
  });

  it('calculates maxStalenessMs from timeframe and multiplier', () => {
    const series = [makeCandle({ timestamp: 1_000_000 })];
    // 1h = 3_600_000ms. With maxStaleIntervals: 2 -> allowed 7_200_000ms
    const freshResult = validateStaleness(series, {
      asOf: 1_000_000 + 5_000_000,
      timeframe: '1h',
      maxStaleIntervals: 2,
    });
    expect(freshResult.passed).toBe(true);

    const staleResult = validateStaleness(series, {
      asOf: 1_000_000 + 8_000_000,
      timeframe: '1h',
      maxStaleIntervals: 2,
    });
    expect(staleResult.passed).toBe(false);
  });

  it('fails closed when series is empty', () => {
    const result = validateStaleness([], { asOf: 1_000_000, maxStalenessMs: 60_000 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('fails closed when asOf is missing or invalid', () => {
    const series = [makeCandle()];
    const result = validateStaleness(series, undefined);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('fails closed with structured violation on invalid timeframe string without throwing', () => {
    const series = makeSeries(5);
    const result = validateStaleness(series, { asOf: 1_700_000_000_000, timeframe: 'bad_cadence' });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Invalid timeframe format');
  });
});
