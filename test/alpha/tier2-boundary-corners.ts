import { describe, expect, it } from 'vitest';
import {
  type Candle,
  type DataQualityConfig,
  type QualityDimension,
  validateCandleSeries,
} from '@/tree/alpha/data-quality';
import { BASE_TIMESTAMP, createBaseCandle, generateMonotonicCandles } from './data-quality-fixtures';

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

interface Tier2Case {
  readonly id: string;
  readonly dim: QualityDimension;
  readonly series: readonly Candle[];
  readonly config?: DataQualityConfig;
  readonly secondary?: readonly Candle[];
  readonly pass: boolean;
}

const TIER2_CASES: readonly Tier2Case[] = [
  // D1 Monotonicity Boundaries
  { id: 'B1.1 Minimal positive step +1ms', dim: 'timestamp_monotonicity', series: [c(1000), c(1001)], pass: true },
  { id: 'B1.2 Exact zero step 0ms (t_i == t_{i-1})', dim: 'timestamp_monotonicity', series: [c(1000), c(1000)], pass: false },
  { id: 'B1.3 Minimal negative step -1ms backwards', dim: 'timestamp_monotonicity', series: [c(1000), c(999)], pass: false },
  { id: 'B1.4 Boundary single candle series', dim: 'timestamp_monotonicity', series: [c(1000)], pass: true },
  { id: 'B1.5 Boundary empty series', dim: 'timestamp_monotonicity', series: [], pass: true },
  // D2 Duplicate Boundaries
  { id: 'B2.1 1ms difference between consecutive bars', dim: 'duplicate_candles', series: [c(1000), c(1001)], pass: true },
  { id: 'B2.2 Exact 0ms difference between consecutive bars', dim: 'duplicate_candles', series: [c(1000), c(1000)], pass: false },
  { id: 'B2.3 Duplicate at extreme series boundary (first and last)', dim: 'duplicate_candles', series: [c(1000), ...generateMonotonicCandles(10, 1001, 10), c(1000)], pass: false },
  { id: 'B2.4 Single candle series duplicate boundary', dim: 'duplicate_candles', series: [c(1000)], pass: true },
  { id: 'B2.5 Empty series duplicate boundary', dim: 'duplicate_candles', series: [], pass: true },
  // D3 Missing Intervals Boundaries
  { id: 'B3.1 Gap below 1.5x rounding threshold (delta == 89999ms)', dim: 'missing_intervals', series: [c(1000), c(1000 + 89_999)], config: { missingIntervals: { expectedIntervalMs: 60_000 } }, pass: true },
  { id: 'B3.2 Gap at 1.5x rounding threshold (delta == 90000ms => missing 1)', dim: 'missing_intervals', series: [c(1000), c(1000 + 90_000)], config: { missingIntervals: { expectedIntervalMs: 60_000 } }, pass: false },
  { id: 'B3.3 Missing gap equal to maxAllowedGapIntervals (1 missing)', dim: 'missing_intervals', series: [c(1000), c(1000 + 120_000)], config: { missingIntervals: { expectedIntervalMs: 60_000, maxAllowedGapIntervals: 1 } }, pass: true },
  { id: 'B3.4 Missing gap exceeding maxAllowedGapIntervals (2 missing)', dim: 'missing_intervals', series: [c(1000), c(1000 + 180_000)], config: { missingIntervals: { expectedIntervalMs: 60_000, maxAllowedGapIntervals: 1 } }, pass: false },
  { id: 'B3.5 Boundary single candle interval check', dim: 'missing_intervals', series: [c(1000)], config: { missingIntervals: { expectedIntervalMs: 60_000 } }, pass: true },
  // D4 Stale Data Boundaries
  { id: 'B4.1 Latest ts exactly at asOf - maxStalenessMs', dim: 'stale_data', series: [c(1000)], config: { staleness: { asOf: 2000, maxStalenessMs: 1000 } }, pass: true },
  { id: 'B4.2 Latest ts 1ms beyond asOf - maxStalenessMs', dim: 'stale_data', series: [c(999)], config: { staleness: { asOf: 2000, maxStalenessMs: 1000 } }, pass: false },
  { id: 'B4.3 Latest ts exactly equal to asOf (0ms staleness)', dim: 'stale_data', series: [c(2000)], config: { staleness: { asOf: 2000, maxStalenessMs: 1000 } }, pass: true },
  { id: 'B4.4 Timeframe-based staleness exact multiplier limit', dim: 'stale_data', series: [c(1000)], config: { staleness: { asOf: 1000 + 120_000, timeframe: '1m', maxStaleIntervals: 2 } }, pass: true },
  { id: 'B4.5 Timeframe-based staleness 1ms past multiplier limit', dim: 'stale_data', series: [c(1000)], config: { staleness: { asOf: 1000 + 120_001, timeframe: '1m', maxStaleIntervals: 2 } }, pass: false },
  // D5 Impossible OHLC Boundaries
  { id: 'B5.1 High exactly equal to max(open, close)', dim: 'impossible_ohlc', series: [c(1000, { open: 100, high: 102, low: 98, close: 102 })], pass: true },
  { id: 'B5.2 High strictly less than max(open, close)', dim: 'impossible_ohlc', series: [c(1000, { open: 100, high: 101.99, low: 98, close: 102 })], pass: false },
  { id: 'B5.3 Low exactly equal to min(open, close)', dim: 'impossible_ohlc', series: [c(1000, { open: 100, high: 105, low: 100, close: 102 })], pass: true },
  { id: 'B5.4 Low strictly greater than min(open, close)', dim: 'impossible_ohlc', series: [c(1000, { open: 100, high: 105, low: 100.01, close: 102 })], pass: false },
  { id: 'B5.5 Extreme microscopic float price 1e-8', dim: 'impossible_ohlc', series: [c(1000, { open: 1e-8, high: 2e-8, low: 1e-8, close: 1.5e-8 })], pass: true },
  // D6 Volume Anomalies Boundaries
  { id: 'B6.1 Microscopic positive float volume 1e-9', dim: 'volume_anomalies', series: [c(1000, { volume: 1e-9 })], pass: true },
  { id: 'B6.2 Exact zero volume when allowed', dim: 'volume_anomalies', series: [c(1000, { volume: 0 })], config: { volume: { allowZeroVolume: true } }, pass: true },
  { id: 'B6.3 Exact zero volume when disallowed', dim: 'volume_anomalies', series: [c(1000, { volume: 0 })], config: { volume: { allowZeroVolume: false } }, pass: false },
  { id: 'B6.4 Zero streak equal to maxConsecutiveZeroVolume', dim: 'volume_anomalies', series: [c(1000, { volume: 0 }), c(2000, { volume: 0 })], config: { volume: { maxConsecutiveZeroVolume: 2 } }, pass: true },
  { id: 'B6.5 Zero streak exceeding maxConsecutiveZeroVolume', dim: 'volume_anomalies', series: [c(1000, { volume: 0 }), c(2000, { volume: 0 }), c(3000, { volume: 0 })], config: { volume: { maxConsecutiveZeroVolume: 2 } }, pass: false },
  // D7 Cross-Source Alignment Boundaries
  { id: 'B7.1 Skew exactly equal to toleranceMs', dim: 'cross_source_alignment', series: [c(1000)], secondary: [c(1050)], config: { alignment: { toleranceMs: 50 } }, pass: true },
  { id: 'B7.2 Skew 1ms past toleranceMs', dim: 'cross_source_alignment', series: [c(1000)], secondary: [c(1051)], config: { alignment: { toleranceMs: 50 } }, pass: false },
  { id: 'B7.3 Unmatched count equal to maxUnmatchedCandles', dim: 'cross_source_alignment', series: [c(1000), c(2000)], secondary: [c(1000)], config: { alignment: { maxUnmatchedCandles: 1 } }, pass: true },
  { id: 'B7.4 Unmatched count exceeding maxUnmatchedCandles', dim: 'cross_source_alignment', series: [c(1000), c(2000), c(3000)], secondary: [c(1000)], config: { alignment: { maxUnmatchedCandles: 1 } }, pass: false },
  { id: 'B7.5 Empty primary and secondary series', dim: 'cross_source_alignment', series: [], secondary: [], pass: true },
  // D8 Future Data Boundaries
  { id: 'B8.1 Timestamp exactly equal to asOf boundary', dim: 'future_data', series: [c(BASE_TIMESTAMP)], config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: true },
  { id: 'B8.2 Timestamp 1ms in the future past asOf', dim: 'future_data', series: [c(BASE_TIMESTAMP + 1)], config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: false },
  { id: 'B8.3 Timestamp 1ms in the past before asOf', dim: 'future_data', series: [c(BASE_TIMESTAMP - 1)], config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: true },
  { id: 'B8.4 Far future epoch boundary (year 2050)', dim: 'future_data', series: [c(2_524_608_000_000)], config: { futureData: { asOf: 2_524_608_000_000 } }, pass: true },
  { id: 'B8.5 Empty series future check boundary', dim: 'future_data', series: [], config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: true },
  // D9 Exchange Outage Boundaries
  { id: 'B9.1 Consecutive identical streak == max - 1 (2 identical)', dim: 'exchange_outage', series: [c(1000, { close: 100 }), c(2000, { close: 100 }), c(3000, { close: 101 })], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, pass: true },
  { id: 'B9.2 Consecutive identical streak == max (3 identical)', dim: 'exchange_outage', series: [c(1000, { close: 100 }), c(2000, { close: 100 }), c(3000, { close: 100 })], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, pass: false },
  { id: 'B9.3 Outage broken by microscopic close delta 1e-4', dim: 'exchange_outage', series: [c(1000, { close: 100 }), c(2000, { close: 100 }), c(3000, { close: 100.0001 })], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, pass: true },
  { id: 'B9.4 Outage broken by microscopic volume delta 0.01', dim: 'exchange_outage', series: [c(1000, { volume: 100 }), c(2000, { volume: 100 }), c(3000, { volume: 100.01 })], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, pass: true },
  { id: 'B9.5 Series length strictly less than outage threshold', dim: 'exchange_outage', series: [c(1000, { close: 100 }), c(2000, { close: 100 })], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, pass: true },
];

export function registerTier2BoundaryCornerTests(): void {
  describe('Tier 2: Boundary & Corner Cases (45 boundary conditions)', () => {
    for (const tc of TIER2_CASES) {
      it(`[${tc.dim}] ${tc.id}`, () => {
        const res = validateCandleSeries(
          tc.series,
          { ...tc.config, enabledDimensions: [tc.dim] },
          tc.secondary,
        );
        expect(res.valid).toBe(tc.pass);
        expect(res.status).toBe(tc.pass ? 'VALID' : 'DATA_INVALID');
        if (!tc.pass) {
          expect(res.violations.some((v) => v.dimension === tc.dim)).toBe(true);
        } else {
          expect(res.violations).toHaveLength(0);
        }
      });
    }
  });
}
