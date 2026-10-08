import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { validateCandleSeries } from '../validator';
import { validateDuplicates } from '../validate-duplicates';
import { validateFutureData } from '../validate-future-data';
import { validateIntervals } from '../validate-intervals';
import { validateMonotonicity } from '../validate-monotonicity';
import { validateStaleness } from '../validate-staleness';
import { makeCandle, makeSeries } from './test-helpers';

describe('Adversarial Stress: Timestamps, Intervals & Cadence', () => {
  it('detects inverted timestamps with microsecond drift and exact diagnostics', () => {
    const base = 1_700_000_000_000;
    const candles: Candle[] = [
      makeCandle({ timestamp: base }),
      makeCandle({ timestamp: base - 0.001 }), // 1 microsecond backward drift
    ];

    const result = validateMonotonicity(candles);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(1);
    expect(result.violations[0].timestamp).toBe(base - 0.001);
    expect(result.violations[0].details.previousIndex).toBe(0);
    expect(result.violations[0].details.diffMs).toBeCloseTo(-0.001);

    // Fail-closed composite validation
    const composite = validateCandleSeries(candles);
    expect(composite.valid).toBe(false);
    expect(composite.status).toBe('DATA_INVALID');
  });

  it('detects fully inverted (descending) series with multiple violations', () => {
    const base = 1_700_000_000_000;
    const candles: Candle[] = [
      makeCandle({ timestamp: base + 4_000 }),
      makeCandle({ timestamp: base + 3_000 }),
      makeCandle({ timestamp: base + 2_000 }),
      makeCandle({ timestamp: base + 1_000 }),
      makeCandle({ timestamp: base }),
    ];

    const result = validateMonotonicity(candles);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(result.violations[i].index).toBe(i + 1);
    }
  });

  it('detects non-finite timestamps (NaN, Infinity, -Infinity)', () => {
    const candles: Candle[] = [
      makeCandle({ timestamp: Number.NaN }),
      makeCandle({ timestamp: 1_700_000_000_000 }),
      makeCandle({ timestamp: Number.POSITIVE_INFINITY }),
    ];

    const result = validateMonotonicity(candles);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.violations.some((v) => v.index === 0)).toBe(true);
    expect(result.violations.some((v) => v.index === 2)).toBe(true);
  });

  it('detects multiple duplicate timestamps and non-adjacent duplicates', () => {
    const ts = 1_700_000_000_000;
    const candles: Candle[] = [
      makeCandle({ timestamp: ts }),
      makeCandle({ timestamp: ts + 1_000 }),
      makeCandle({ timestamp: ts }), // non-adjacent duplicate
      makeCandle({ timestamp: ts }), // repeated duplicate
    ];

    const result = validateDuplicates(candles);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].index).toBe(2);
    expect(result.violations[0].details.firstSeenIndex).toBe(0);
    expect(result.violations[1].index).toBe(3);
    expect(result.violations[1].details.firstSeenIndex).toBe(0);
  });

  it('detects multi-hour gap in 1h series with accurate missing count diagnostic', () => {
    const base = 1_700_000_000_000;
    const hourMs = 3_600_000;
    const candles: Candle[] = [
      makeCandle({ timestamp: base }),
      makeCandle({ timestamp: base + 4 * hourMs }), // 4h jump (missing 3 candles)
      makeCandle({ timestamp: base + 5 * hourMs }),
    ];

    const result = validateIntervals(candles, { timeframe: '1h' });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0];
    expect(v.index).toBe(1);
    expect(v.timestamp).toBe(base + 4 * hourMs);
    expect(v.details.gapMs).toBe(4 * hourMs);
    expect(v.details.expectedIntervalMs).toBe(hourMs);
    expect(v.details.missingCount).toBe(3);
  });

  it('detects 1ms future data lookahead leak and enforces boundary', () => {
    const asOf = 1_700_000_000_000;
    const exactBoundary = [makeCandle({ timestamp: asOf })];
    expect(validateFutureData(exactBoundary, { asOf }).passed).toBe(true);

    const futureLeak = [makeCandle({ timestamp: asOf + 1 })];
    const result = validateFutureData(futureLeak, { asOf });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].index).toBe(0);
    expect(result.violations[0].details.lookaheadDeltaMs).toBe(1);

    const composite = validateCandleSeries(futureLeak, { asOf });
    expect(composite.valid).toBe(false);
    expect(composite.status).toBe('DATA_INVALID');
  });

  it('detects stale data feed at exact boundary threshold', () => {
    const base = 1_700_000_000_000;
    const maxStalenessMs = 120_000;
    const asOf = base + maxStalenessMs;

    // Exactly at boundary passes
    const fresh = [makeCandle({ timestamp: base })];
    expect(validateStaleness(fresh, { asOf, maxStalenessMs }).passed).toBe(true);

    // 1ms past boundary fails
    const staleAsOf = asOf + 1;
    const staleResult = validateStaleness(fresh, { asOf: staleAsOf, maxStalenessMs });
    expect(staleResult.passed).toBe(false);
    expect(staleResult.violations[0].details.stalenessMs).toBe(maxStalenessMs + 1);
  });

  it('fails closed on empty series or missing asOf in standalone staleness validator', () => {
    const emptyResult = validateStaleness([], { asOf: 1_700_000_000_000 });
    expect(emptyResult.passed).toBe(false);
    expect(emptyResult.violations[0].message).toContain('Candle series is empty');

    const noAsOfResult = validateStaleness(makeSeries(5), {} as never);
    expect(noAsOfResult.passed).toBe(false);
    expect(noAsOfResult.violations[0].message).toContain('Missing or non-finite "asOf"');
  });

  it('correctly uses nested config fallbacks for missingIntervals and staleness', () => {
    const base = 1_700_000_000_000;
    const candles: Candle[] = [
      makeCandle({ timestamp: base }),
      makeCandle({ timestamp: base + 120_000 }), // 2m gap in 1m series
    ];

    // Using nested missingIntervals.timeframe fallback
    const resTimeframe = validateCandleSeries(candles, {
      missingIntervals: { timeframe: '1m' },
    });
    expect(resTimeframe.valid).toBe(false);
    expect(resTimeframe.status).toBe('DATA_INVALID');

    // Using nested missingIntervals.expectedIntervalMs fallback
    const resExpectedMs = validateCandleSeries(candles, {
      missingIntervals: { expectedIntervalMs: 60_000 },
    });
    expect(resExpectedMs.valid).toBe(false);
    expect(resExpectedMs.status).toBe('DATA_INVALID');

    // Using nested staleness.timeframe fallback
    const staleNested = validateCandleSeries([makeCandle({ timestamp: base })], {
      staleness: { asOf: base + 500_000, timeframe: '1m', maxStaleIntervals: 2 },
    });
    expect(staleNested.valid).toBe(false);
    expect(staleNested.status).toBe('DATA_INVALID');
  });
});
