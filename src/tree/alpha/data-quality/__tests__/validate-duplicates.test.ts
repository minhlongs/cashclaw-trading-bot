import { describe, expect, it } from 'vitest';
import { validateDuplicates } from '../validate-duplicates';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateDuplicates (D2)', () => {
  it('passes on unique timestamps', () => {
    const series = makeSeries(5, 60_000);
    const result = validateDuplicates(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('duplicate_candles');
  });

  it('passes on empty series and single candle', () => {
    expect(validateDuplicates([]).passed).toBe(true);
    expect(validateDuplicates([makeCandle()]).passed).toBe(true);
  });

  it('ignores non-finite timestamps (deferred to other checks)', () => {
    const series = [
      makeCandle({ timestamp: Number.NaN }),
      makeCandle({ timestamp: 1_000 }),
    ];
    expect(validateDuplicates(series).passed).toBe(true);
  });

  it('detects adjacent duplicates', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
    ];
    const result = validateDuplicates(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(1);
    expect(result.violations[0].details.firstSeenIndex).toBe(0);
    expect(result.violations[0].details.duplicateIndex).toBe(1);
  });

  it('detects non-adjacent duplicates across the series', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 3_000 }),
      makeCandle({ timestamp: 1_000 }),
    ];
    const result = validateDuplicates(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(3);
    expect(result.violations[0].details.firstSeenIndex).toBe(0);
  });

  it('detects multiple duplicate pairs', () => {
    const series = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
    ];
    const result = validateDuplicates(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});
