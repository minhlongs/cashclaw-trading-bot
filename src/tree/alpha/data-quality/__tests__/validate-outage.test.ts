import { describe, expect, it } from 'vitest';
import { validateOutage } from '../validate-outage';
import { makeCandle, makeSeries } from './test-helpers';

describe('validateOutage (D9)', () => {
  it('passes on normal price variations', () => {
    const series = makeSeries(10);
    const result = validateOutage(series);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.dimension).toBe('exchange_outage');
  });

  it('passes on consecutive identical bars below threshold', () => {
    const identicalBar = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
    const series = [
      makeCandle({ timestamp: 1_000, ...identicalBar }),
      makeCandle({ timestamp: 2_000, ...identicalBar }), // 2 bars, default threshold 3
    ];
    const result = validateOutage(series);
    expect(result.passed).toBe(true);
  });

  it('detects outage on 3 consecutive identical bars (default)', () => {
    const identicalBar = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
    const series = [
      makeCandle({ timestamp: 1_000, ...identicalBar }),
      makeCandle({ timestamp: 2_000, ...identicalBar }),
      makeCandle({ timestamp: 3_000, ...identicalBar }),
    ];
    const result = validateOutage(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.consecutiveBars).toBe(3);
    expect(result.violations[0].details.startIndex).toBe(0);
    expect(result.violations[0].details.endIndex).toBe(2);
  });

  it('detects outage inside a longer series', () => {
    const identical = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
    const series = [
      makeCandle({ timestamp: 1_000, open: 50, high: 55, low: 45, close: 52, volume: 500 }),
      makeCandle({ timestamp: 2_000, ...identical }),
      makeCandle({ timestamp: 3_000, ...identical }),
      makeCandle({ timestamp: 4_000, ...identical }),
      makeCandle({ timestamp: 5_000, open: 101, high: 106, low: 96, close: 103, volume: 1_200 }),
    ];
    const result = validateOutage(series);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details.startIndex).toBe(1);
    expect(result.violations[0].details.endIndex).toBe(3);
  });

  it('respects custom maxConsecutiveIdenticalBars threshold', () => {
    const identical = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
    const series = [
      makeCandle({ timestamp: 1_000, ...identical }),
      makeCandle({ timestamp: 2_000, ...identical }),
      makeCandle({ timestamp: 3_000, ...identical }),
    ];
    const result = validateOutage(series, { maxConsecutiveIdenticalBars: 4 });
    expect(result.passed).toBe(true);
  });

  it('fails closed when maxConsecutiveIdenticalBars is NaN, <= 0, or non-finite', () => {
    const series = makeSeries(5);
    const resNaN = validateOutage(series, { maxConsecutiveIdenticalBars: Number.NaN });
    expect(resNaN.passed).toBe(false);
    expect(resNaN.violations[0].message).toContain('Invalid maxConsecutiveIdenticalBars');
    const resZero = validateOutage(series, { maxConsecutiveIdenticalBars: 0 });
    expect(resZero.passed).toBe(false);
    const resNeg = validateOutage(series, { maxConsecutiveIdenticalBars: -3 });
    expect(resNeg.passed).toBe(false);
  });
});
