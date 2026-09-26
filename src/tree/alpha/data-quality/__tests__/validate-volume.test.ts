import { describe, expect, it } from 'vitest';
import { validateVolume } from '../validate-volume';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateVolume (D6)', () => {
  it('passes on normal positive volume', () => {
    const series = makeSeries(5);
    const result = validateVolume(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('volume_anomalies');
  });

  it('fails on negative volume', () => {
    const candle = makeCandle({ volume: -1 });
    const result = validateVolume([candle]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('negative_or_non_finite');
  });

  it('fails on non-finite volume (NaN, Infinity)', () => {
    expect(validateVolume([makeCandle({ volume: Number.NaN })]).passed).toBe(false);
    expect(validateVolume([makeCandle({ volume: Number.POSITIVE_INFINITY })]).passed).toBe(false);
  });

  it('allows zero volume by default', () => {
    const candle = makeCandle({ volume: 0 });
    expect(validateVolume([candle]).passed).toBe(true);
  });

  it('fails on zero volume when allowZeroVolume: false', () => {
    const candle = makeCandle({ volume: 0 });
    const result = validateVolume([candle], { allowZeroVolume: false });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('flags isolated zero volume when flagIsolatedZeroVolume: true', () => {
    const series = [
      makeCandle({ timestamp: 1_000, volume: 100 }),
      makeCandle({ timestamp: 2_000, volume: 0 }),
      makeCandle({ timestamp: 3_000, volume: 100 }),
    ];
    const result = validateVolume(series, { flagIsolatedZeroVolume: true });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('isolated_zero_volume');
  });

  it('does not flag non-isolated zero volume when surrounded by zero', () => {
    const series = [
      makeCandle({ timestamp: 1_000, volume: 100 }),
      makeCandle({ timestamp: 2_000, volume: 0 }),
      makeCandle({ timestamp: 3_000, volume: 0 }),
    ];
    const result = validateVolume(series, { flagIsolatedZeroVolume: true });
    expect(result.passed).toBe(true);
  });

  it('flags consecutive zero volume exceeding maxConsecutiveZeroVolume', () => {
    const series = [
      makeCandle({ timestamp: 1_000, volume: 0 }),
      makeCandle({ timestamp: 2_000, volume: 0 }),
      makeCandle({ timestamp: 3_000, volume: 0 }),
    ];
    const result = validateVolume(series, { maxConsecutiveZeroVolume: 2 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
