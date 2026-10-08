import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { validateAlignment } from '../validate-alignment';
import { validateCandleSeries } from '../validator';
import { validateOHLC } from '../validate-ohlc';
import { validateOutage } from '../validate-outage';
import { validateVolume } from '../validate-volume';
import { makeCandle, makeSeries } from './test-helpers';

describe('Adversarial Stress: OHLC, Volume, Outage & Alignment', () => {
  it('rejects all impossible OHLC geometric permutations', () => {
    // 1. High < Low
    const hLtL = [makeCandle({ open: 100, high: 90, low: 95, close: 100 })];
    expect(validateOHLC(hLtL).passed).toBe(false);
    expect(validateOHLC(hLtL).violations[0].details.reason).toBe('high_below_low');

    // 2. High < Open
    const hLtO = [makeCandle({ open: 100, high: 95, low: 90, close: 92 })];
    expect(validateOHLC(hLtO).passed).toBe(false);
    expect(validateOHLC(hLtO).violations[0].details.reason).toBe('high_below_max_oc');

    // 3. High < Close
    const hLtC = [makeCandle({ open: 90, high: 95, low: 85, close: 100 })];
    expect(validateOHLC(hLtC).passed).toBe(false);
    expect(validateOHLC(hLtC).violations[0].details.reason).toBe('high_below_max_oc');

    // 4. Low > Open
    const lGtO = [makeCandle({ open: 90, high: 110, low: 95, close: 105 })];
    expect(validateOHLC(lGtO).passed).toBe(false);
    expect(validateOHLC(lGtO).violations[0].details.reason).toBe('low_above_min_oc');

    // 5. Low > Close
    const lGtC = [makeCandle({ open: 105, high: 110, low: 95, close: 90 })];
    expect(validateOHLC(lGtC).passed).toBe(false);
    expect(validateOHLC(lGtC).violations[0].details.reason).toBe('low_above_min_oc');
  });

  it('rejects zero, negative, and non-finite prices with detailed field diagnostics', () => {
    const zeroPrice = [makeCandle({ open: 0, high: 10, low: 0, close: 5 })];
    expect(validateOHLC(zeroPrice).passed).toBe(false);
    expect(validateOHLC(zeroPrice).violations[0].message).toContain('open=0');

    const negPrice = [makeCandle({ open: 10, high: 20, low: -5, close: 15 })];
    expect(validateOHLC(negPrice).passed).toBe(false);
    expect(validateOHLC(negPrice).violations[0].message).toContain('low=-5');

    const nanPrice = [makeCandle({ open: Number.NaN, high: 20, low: 10, close: 15 })];
    expect(validateOHLC(nanPrice).passed).toBe(false);

    const infPrice = [makeCandle({ open: 10, high: Number.POSITIVE_INFINITY, low: 10, close: 10 })];
    expect(validateOHLC(infPrice).passed).toBe(false);
  });

  it('handles extreme float prices without numerical overflow', () => {
    const validExtreme = [
      makeCandle({
        open: 1e300,
        high: 1e300,
        low: 1e300,
        close: 1e300,
      }),
    ];
    expect(validateOHLC(validExtreme).passed).toBe(true);

    const invalidExtreme = [
      makeCandle({
        open: 1e300,
        high: 1e299, // High < Open
        low: 1e290,
        close: 1e295,
      }),
    ];
    expect(validateOHLC(invalidExtreme).passed).toBe(false);
  });

  it('detects negative and non-finite volumes, isolated zero, and excessive zero streaks', () => {
    // Negative and NaN volume
    expect(validateVolume([makeCandle({ volume: -0.01 })]).passed).toBe(false);
    expect(validateVolume([makeCandle({ volume: Number.NaN })]).passed).toBe(false);
    expect(validateVolume([makeCandle({ volume: Number.POSITIVE_INFINITY })]).passed).toBe(false);

    // Isolated zero volume
    const series = [
      makeCandle({ volume: 100 }),
      makeCandle({ volume: 0 }),
      makeCandle({ volume: 100 }),
    ];
    const isolatedRes = validateVolume(series, { flagIsolatedZeroVolume: true });
    expect(isolatedRes.passed).toBe(false);
    expect(isolatedRes.violations[0].details.reason).toBe('isolated_zero_volume');

    // Consecutive zero volume exceeding threshold
    const zeroSeries = [
      makeCandle({ volume: 0 }),
      makeCandle({ volume: 0 }),
      makeCandle({ volume: 0 }),
    ];
    const streakRes = validateVolume(zeroSeries, { maxConsecutiveZeroVolume: 2 });
    expect(streakRes.passed).toBe(false);
    expect(streakRes.violations[0].details.streak).toBe(3);
  });

  it('detects frozen feeds / exchange outage across middle and terminal positions', () => {
    const base = makeSeries(2);
    const identical = [
      makeCandle({ timestamp: 100, open: 50, high: 55, low: 45, close: 52, volume: 100 }),
      makeCandle({ timestamp: 200, open: 50, high: 55, low: 45, close: 52, volume: 100 }),
      makeCandle({ timestamp: 300, open: 50, high: 55, low: 45, close: 52, volume: 100 }),
    ];

    // Mid-series outage
    const midSeries = [...base, ...identical, makeCandle({ timestamp: 400, open: 51, high: 56, low: 46, close: 53, volume: 100 })];
    const midResult = validateOutage(midSeries, { maxConsecutiveIdenticalBars: 3 });
    expect(midResult.passed).toBe(false);
    expect(midResult.violations[0].details.consecutiveBars).toBe(3);

    // Identical OHLC but varying volume must NOT trigger outage
    const volumeVarying = [
      makeCandle({ timestamp: 100, open: 50, high: 55, low: 45, close: 52, volume: 100 }),
      makeCandle({ timestamp: 200, open: 50, high: 55, low: 45, close: 52, volume: 101 }),
      makeCandle({ timestamp: 300, open: 50, high: 55, low: 45, close: 52, volume: 102 }),
    ];
    expect(validateOutage(volumeVarying, { maxConsecutiveIdenticalBars: 3 }).passed).toBe(true);
  });

  it('detects cross-source alignment deviations and length discrepancies', () => {
    const primary = makeSeries(3, 60_000, 1_000_000);
    const shiftedSecondary = makeSeries(3, 60_000, 1_000_500); // 500ms shift

    // Fails when shift exceeds tolerance
    const alignResult = validateAlignment(primary, shiftedSecondary, { toleranceMs: 100 });
    expect(alignResult.passed).toBe(false);
    expect(alignResult.violations[0].details.diffMs).toBe(500);

    // Passes when within tolerance
    expect(validateAlignment(primary, shiftedSecondary, { toleranceMs: 600 }).passed).toBe(true);

    // Fails on empty secondary
    const emptySec = validateAlignment(primary, []);
    expect(emptySec.passed).toBe(false);
    expect(emptySec.violations[0].message).toContain('Secondary series is empty');
  });

  it('fails closed with DATA_INVALID on multi-dimensionally corrupted data', () => {
    const corruptedSeries: Candle[] = [
      makeCandle({ timestamp: 2_000, open: -10, high: 5, low: 10, close: 5, volume: -50 }),
      makeCandle({ timestamp: 1_000, open: 100, high: 90, low: 80, close: 85, volume: Number.NaN }),
    ];

    const result = validateCandleSeries(corruptedSeries, { asOf: 1_500 });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('DATA_INVALID');
    expect(result.violations.length).toBeGreaterThanOrEqual(4);

    const dimensions = new Set(result.violations.map((v) => v.dimension));
    expect(dimensions.has('timestamp_monotonicity')).toBe(true);
    expect(dimensions.has('impossible_ohlc')).toBe(true);
    expect(dimensions.has('volume_anomalies')).toBe(true);
    expect(dimensions.has('future_data')).toBe(true);
  });

  it('stress tests 10,000 candles series performance within budget (<50ms)', () => {
    const largeSeries = makeSeries(10_000, 60_000, 1_000_000_000);
    const start = performance.now();
    const result = validateCandleSeries(largeSeries, {
      asOf: 1_000_000_000 + 10_000 * 60_000,
      timeframe: '1m',
    });
    const elapsed = performance.now() - start;

    expect(result.valid).toBe(true);
    expect(result.status).toBe('VALID');
    expect(result.totalCandles).toBe(10_000);
    expect(elapsed).toBeLessThan(100);
  });
});
