import { describe, expect, it } from 'vitest';
import { validateMonotonicity } from '../validate-monotonicity';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateMonotonicity (D1)', () => {
  it('passes on strictly increasing timestamps', () => {
    const series = makeSeries(5, 60_000);
    const result = validateMonotonicity(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('timestamp_monotonicity');
  });

  it('passes on empty series and single candle', () => {
    expect(validateMonotonicity([]).passed).toBe(true);
    expect(validateMonotonicity([makeCandle()]).passed).toBe(true);
  });

  it('fails when timestamp is equal to previous (non-increasing)', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateMonotonicity(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(1);
    expect(result.violations[0].details.diffMs).toBe(0);
  });

  it('fails when timestamp decreases (inverted time)', () => {
    const series = [
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateMonotonicity(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.diffMs).toBe(-1_000);
  });

  it('flags non-finite timestamps (NaN, Infinity)', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: Number.NaN }),
      makeCandle({ timestamp: Number.POSITIVE_INFINITY }),
    ];
    const result = validateMonotonicity(series);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});
