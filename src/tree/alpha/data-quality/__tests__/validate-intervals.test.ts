import { describe, expect, it } from 'vitest';
import { validateIntervals } from '../validate-intervals';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateIntervals (D3)', () => {
  it('passes on contiguous regular series', () => {
    const series = makeSeries(10, 60_000);
    const result = validateIntervals(series, { timeframe: '1m' });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('missing_intervals');
  });

  it('passes on series with fewer than 2 candles', () => {
    expect(validateIntervals([]).passed).toBe(true);
    expect(validateIntervals([makeCandle()]).passed).toBe(true);
  });

  it('detects missing intervals with explicit timeframe', () => {
    const series = [
      makeCandle({ timestamp: 0 }),
      makeCandle({ timestamp: 3_600_000 }), // 1h
      makeCandle({ timestamp: 14_400_000 }), // jumped to 4h (missing 2h, 3h)
    ];
    const result = validateIntervals(series, { timeframe: '1h' });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(2);
    expect(result.violations[0].details.missingCount).toBe(2);
  });

  it('detects missing intervals with expectedIntervalMs', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 5_000 }), // missing 3000, 4000
    ];
    const result = validateIntervals(series, { expectedIntervalMs: 1_000 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.missingCount).toBe(2);
  });

  it('allows gaps within maxAllowedGapIntervals', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 3_000 }), // 1 missing candle
    ];
    const result = validateIntervals(series, {
      expectedIntervalMs: 1_000,
      maxAllowedGapIntervals: 1,
    });
    expect(result.passed).toBe(true);
  });

  it('infers expected interval when config not specified', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 3_000 }),
      makeCandle({ timestamp: 6_000 }), // inferred 1000ms, missing 2
    ];
    const result = validateIntervals(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('fails closed with structured violation on invalid timeframe string without throwing', () => {
    const series = makeSeries(5);
    const result = validateIntervals(series, { timeframe: 'bad_cadence' });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Invalid timeframe format');
  });
});
