import { describe, expect, it } from 'vitest';
import { validateOHLC } from '../validate-ohlc';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateOHLC (D5)', () => {
  it('passes on valid geometric OHLC candles', () => {
    const series = makeSeries(5);
    const result = validateOHLC(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('impossible_ohlc');
  });

  it('passes on flat bar doji where O=H=L=C', () => {
    const doji = makeCandle({ open: 100, high: 100, low: 100, close: 100 });
    const result = validateOHLC([doji]);
    expect(result.passed).toBe(true);
  });

  it('fails when High is less than Open', () => {
    const candle = makeCandle({ open: 105, high: 100, low: 90, close: 95 });
    const result = validateOHLC([candle]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('high_below_max_oc');
  });

  it('fails when High is less than Close', () => {
    const candle = makeCandle({ open: 95, high: 100, low: 90, close: 105 });
    const result = validateOHLC([candle]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('high_below_max_oc');
  });

  it('fails when Low is greater than Open', () => {
    const candle = makeCandle({ open: 90, high: 110, low: 95, close: 100 });
    const result = validateOHLC([candle]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('low_above_min_oc');
  });

  it('fails when Low is greater than Close', () => {
    const candle = makeCandle({ open: 100, high: 110, low: 95, close: 90 });
    const result = validateOHLC([candle]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.reason).toBe('low_above_min_oc');
  });

  it('fails when High < Low', () => {
    const candle = makeCandle({ open: 90, high: 80, low: 90, close: 90 });
    const result = validateOHLC([candle]);
    expect(result.passed).toBe(false);
  });

  it('fails on zero or negative prices', () => {
    const zeroPrice = makeCandle({ open: 0 });
    expect(validateOHLC([zeroPrice]).passed).toBe(false);

    const negPrice = makeCandle({ low: -5 });
    expect(validateOHLC([negPrice]).passed).toBe(false);
  });

  it('fails on non-finite prices', () => {
    const nanCandle = makeCandle({ high: Number.NaN });
    expect(validateOHLC([nanCandle]).passed).toBe(false);

    const infCandle = makeCandle({ close: Number.POSITIVE_INFINITY });
    expect(validateOHLC([infCandle]).passed).toBe(false);
  });
});
