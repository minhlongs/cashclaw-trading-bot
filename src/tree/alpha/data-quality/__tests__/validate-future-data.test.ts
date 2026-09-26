import { describe, expect, it } from 'vitest';
import { validateFutureData } from '../validate-future-data';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateFutureData (D8)', () => {
  it('passes when all candles are at or before asOf', () => {
    const series = makeSeries(5, 60_000, 1_000_000); // 1_000_000 to 1_240_000
    const result = validateFutureData(series, { asOf: 1_240_000 });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('future_data');
  });

  it('fails when candle timestamp is strictly greater than asOf', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }), // future
    ];
    const result = validateFutureData(series, { asOf: 1_500 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(1);
    expect(result.violations[0].details.lookaheadDeltaMs).toBe(500);
  });

  it('fails closed when config or asOf is missing/non-finite', () => {
    const series = [makeCandle()];
    expect(validateFutureData(series, undefined).passed).toBe(false);
    expect(validateFutureData(series, { asOf: Number.NaN }).passed).toBe(false);
  });

  it('passes on empty series when asOf is provided', () => {
    const result = validateFutureData([], { asOf: 1_000_000 });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails closed when candle timestamp is NaN or non-finite', () => {
    const series = [makeCandle({ timestamp: Number.NaN })];
    const result = validateFutureData(series, { asOf: 1_000_000 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Non-finite timestamp');
  });
});
