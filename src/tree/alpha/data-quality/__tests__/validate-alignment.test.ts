import { describe, expect, it } from 'vitest';
import { validateAlignment } from '../validate-alignment';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateAlignment (D7)', () => {
  it('passes when secondary series is not provided (single-series mode)', () => {
    const series = makeSeries(5);
    const result = validateAlignment(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('cross_source_alignment');
  });

  it('passes when both series are empty', () => {
    const result = validateAlignment([], []);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when primary and secondary have identical timestamps', () => {
    const primary = makeSeries(5, 60_000, 1_000_000);
    const secondary = makeSeries(5, 60_000, 1_000_000);
    const result = validateAlignment(primary, secondary);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when drift is within toleranceMs', () => {
    const primary = [makeCandle({ timestamp: 1_000 })];
    const secondary = [makeCandle({ timestamp: 1_050 })];
    const result = validateAlignment(primary, secondary, { toleranceMs: 100 });
    expect(result.passed).toBe(true);
  });

  it('fails when drift exceeds toleranceMs', () => {
    const primary = [makeCandle({ timestamp: 1_000 })];
    const secondary = [makeCandle({ timestamp: 1_200 })];
    const result = validateAlignment(primary, secondary, { toleranceMs: 100 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.diffMs).toBe(200);
  });

  it('fails when secondary is empty while primary is non-empty', () => {
    const primary = makeSeries(3);
    const result = validateAlignment(primary, []);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('allows unmatched candles up to maxUnmatchedCandles', () => {
    const primary = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_000 }),
    ];
    const secondary = [
      makeCandle({ timestamp: 1_000 }),
      makeCandle({ timestamp: 2_500 }),
    ];
    const result = validateAlignment(primary, secondary, {
      toleranceMs: 100,
      maxUnmatchedCandles: 1,
    });
    expect(result.passed).toBe(true);
  });

  it('fails when series length discrepancy exceeds maxUnmatchedCandles', () => {
    const primary = makeSeries(5, 60_000, 1_000_000);
    const secondary = makeSeries(2, 60_000, 1_000_000);
    const result = validateAlignment(primary, secondary, { maxUnmatchedCandles: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.message.includes('Series length discrepancy'))).toBe(true);
  });

  it('fails when secondary is longer than primary and discrepancy exceeds maxUnmatchedCandles', () => {
    const primary = makeSeries(5, 60_000, 1_000_000);
    const secondary = makeSeries(25, 60_000, 1_000_000);
    const result = validateAlignment(primary, secondary, { maxUnmatchedCandles: 5 });
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('fails when primary is empty while secondary is non-empty', () => {
    const secondary = makeSeries(5);
    const result = validateAlignment([], secondary, { maxUnmatchedCandles: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Primary series is empty');
  });

  it('fails closed when toleranceMs or maxUnmatchedCandles are NaN or negative', () => {
    const primary = [makeCandle({ timestamp: 1_000 })];
    const secondary = [makeCandle({ timestamp: 1_000 })];
    const resNaN = validateAlignment(primary, secondary, { toleranceMs: Number.NaN });
    expect(resNaN.passed).toBe(false);
    const resNeg = validateAlignment(primary, secondary, { toleranceMs: -5 });
    expect(resNeg.passed).toBe(false);
    const resUnmatchedNaN = validateAlignment(primary, secondary, { maxUnmatchedCandles: Number.NaN });
    expect(resUnmatchedNaN.passed).toBe(false);
    const resUnmatchedNeg = validateAlignment(primary, secondary, { maxUnmatchedCandles: -1 });
    expect(resUnmatchedNeg.passed).toBe(false);
  });
});
