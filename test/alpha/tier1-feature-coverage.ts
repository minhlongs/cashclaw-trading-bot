import { describe, expect, it } from 'vitest';
import {
  type Candle,
  type DataQualityConfig,
  type QualityDimension,
  validateCandleSeries,
} from '@/tree/alpha/data-quality';
import {
  BASE_TIMESTAMP,
  createBaseCandle,
  generateCorruptedOHLCSeries,
  generateDuplicateSeries,
  generateFutureSeries,
  generateGappedSeries,
  generateMonotonicCandles,
  generateMultiFeedPairs,
  generateOutageSeries,
  generateStaleSeries,
  generateVolumeAnomalySeries,
} from './data-quality-fixtures';

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

interface Tier1Case {
  readonly id: string;
  readonly dim: QualityDimension;
  readonly series: readonly Candle[];
  readonly config?: DataQualityConfig;
  readonly secondary?: readonly Candle[];
  readonly pass: boolean;
}

const TIER1_CASES: readonly Tier1Case[] = [
  // D1: timestamp_monotonicity
  { id: 'D1.1 Monotonic strictly increasing', dim: 'timestamp_monotonicity', series: generateMonotonicCandles(5), pass: true },
  { id: 'D1.2 Monotonic backward step', dim: 'timestamp_monotonicity', series: [c(1000), c(3000), c(2000)], pass: false },
  { id: 'D1.3 Monotonic disordered series', dim: 'timestamp_monotonicity', series: [c(3000), c(2000), c(1000)], pass: false },
  { id: 'D1.4 Monotonic non-finite timestamp', dim: 'timestamp_monotonicity', series: [c(1000), c(Number.NaN)], pass: false },
  { id: 'D1.5 Monotonic single candle series', dim: 'timestamp_monotonicity', series: [c(1000)], pass: true },
  // D2: duplicate_candles
  { id: 'D2.1 Duplicate-free distinct series', dim: 'duplicate_candles', series: generateMonotonicCandles(5), pass: true },
  { id: 'D2.2 Consecutive duplicate timestamps', dim: 'duplicate_candles', series: generateDuplicateSeries(5, 1, 2), pass: false },
  { id: 'D2.3 Distant duplicate timestamps', dim: 'duplicate_candles', series: generateDuplicateSeries(5, 0, 4), pass: false },
  { id: 'D2.4 Multiple duplicate pairs in series', dim: 'duplicate_candles', series: [c(1000), c(1000), c(2000), c(2000)], pass: false },
  { id: 'D2.5 Duplicate check on empty series', dim: 'duplicate_candles', series: [], pass: true },
  // D3: missing_intervals
  { id: 'D3.1 Continuous 1m series matching timeframe', dim: 'missing_intervals', series: generateMonotonicCandles(5, BASE_TIMESTAMP, 60_000), config: { timeframe: '1m' }, pass: true },
  { id: 'D3.2 Missing 3-bar gap on 1m series', dim: 'missing_intervals', series: generateGappedSeries(5, 2, 3, 60_000), config: { timeframe: '1m' }, pass: false },
  { id: 'D3.3 Missing 10-bar massive gap', dim: 'missing_intervals', series: generateGappedSeries(5, 2, 10, 60_000), config: { timeframe: '1m' }, pass: false },
  { id: 'D3.4 Missing interval with invalid timeframe', dim: 'missing_intervals', series: generateMonotonicCandles(5), config: { missingIntervals: { timeframe: 'invalid-tf' } }, pass: false },
  { id: 'D3.5 Gap within configured tolerance', dim: 'missing_intervals', series: generateGappedSeries(5, 2, 2, 60_000), config: { missingIntervals: { expectedIntervalMs: 60_000, maxAllowedGapIntervals: 2 } }, pass: true },
  // D4: stale_data
  { id: 'D4.1 Fresh series within max staleness limit', dim: 'stale_data', series: generateStaleSeries(5, BASE_TIMESTAMP + 120_000, 30_000), config: { staleness: { asOf: BASE_TIMESTAMP + 120_000, maxStalenessMs: 60_000 } }, pass: true },
  { id: 'D4.2 Stale series exceeding maxStalenessMs', dim: 'stale_data', series: generateStaleSeries(5, BASE_TIMESTAMP + 300_000, 200_000), config: { staleness: { asOf: BASE_TIMESTAMP + 300_000, maxStalenessMs: 60_000 } }, pass: false },
  { id: 'D4.3 Stale series exceeding timeframe multiplier', dim: 'stale_data', series: generateStaleSeries(5, BASE_TIMESTAMP + 500_000, 300_000), config: { staleness: { asOf: BASE_TIMESTAMP + 500_000, timeframe: '1m', maxStaleIntervals: 2 } }, pass: false },
  { id: 'D4.4 Stale check with non-finite asOf', dim: 'stale_data', series: generateMonotonicCandles(5), config: { staleness: { asOf: Number.NaN } }, pass: false },
  { id: 'D4.5 Stale check fails closed on empty series', dim: 'stale_data', series: [], config: { staleness: { asOf: BASE_TIMESTAMP, maxStalenessMs: 60_000 } }, pass: false },
  // D5: impossible_ohlc
  { id: 'D5.1 Valid geometric OHLC relationships', dim: 'impossible_ohlc', series: generateMonotonicCandles(5), pass: true },
  { id: 'D5.2 Impossible High less than Low', dim: 'impossible_ohlc', series: generateCorruptedOHLCSeries('high_lt_low'), pass: false },
  { id: 'D5.3 Impossible High less than max(O, C)', dim: 'impossible_ohlc', series: generateCorruptedOHLCSeries('high_lt_oc'), pass: false },
  { id: 'D5.4 Impossible Low greater than min(O, C)', dim: 'impossible_ohlc', series: generateCorruptedOHLCSeries('low_gt_oc'), pass: false },
  { id: 'D5.5 Impossible negative price in candle', dim: 'impossible_ohlc', series: generateCorruptedOHLCSeries('negative_price'), pass: false },
  // D6: volume_anomalies
  { id: 'D6.1 Valid positive volume candles', dim: 'volume_anomalies', series: generateMonotonicCandles(5), pass: true },
  { id: 'D6.2 Negative volume anomaly', dim: 'volume_anomalies', series: generateVolumeAnomalySeries('negative'), pass: false },
  { id: 'D6.3 Non-finite NaN volume anomaly', dim: 'volume_anomalies', series: generateVolumeAnomalySeries('nan_volume'), pass: false },
  { id: 'D6.4 Zero volume disallowed by config', dim: 'volume_anomalies', series: generateVolumeAnomalySeries('isolated_zero'), config: { volume: { allowZeroVolume: false } }, pass: false },
  { id: 'D6.5 Isolated zero volume flagged by config', dim: 'volume_anomalies', series: generateVolumeAnomalySeries('isolated_zero'), config: { volume: { flagIsolatedZeroVolume: true } }, pass: false },
  // D7: cross_source_alignment
  { id: 'D7.1 Perfectly aligned multi-feed series', dim: 'cross_source_alignment', series: generateMultiFeedPairs(5).primary, secondary: generateMultiFeedPairs(5).secondary, pass: true },
  { id: 'D7.2 Alignment skew exceeding toleranceMs', dim: 'cross_source_alignment', series: generateMultiFeedPairs(5).primary, secondary: generateMultiFeedPairs(5, { secondarySkewMs: 15_000 }).secondary, config: { alignment: { toleranceMs: 5_000 } }, pass: false },
  { id: 'D7.3 Empty secondary feed with non-empty primary', dim: 'cross_source_alignment', series: generateMonotonicCandles(5), secondary: [], pass: false },
  { id: 'D7.4 Empty primary feed with non-empty secondary', dim: 'cross_source_alignment', series: [], secondary: generateMonotonicCandles(5), pass: false },
  { id: 'D7.5 Length discrepancy exceeding maxUnmatched', dim: 'cross_source_alignment', series: generateMultiFeedPairs(5).primary, secondary: generateMultiFeedPairs(5, { dropSecondaryIndex: 2 }).secondary, config: { alignment: { maxUnmatchedCandles: 0 } }, pass: false },
  // D8: future_data
  { id: 'D8.1 Historical series all before asOf reference', dim: 'future_data', series: generateMonotonicCandles(5, BASE_TIMESTAMP, 60_000), config: { futureData: { asOf: BASE_TIMESTAMP + 300_000 } }, pass: true },
  { id: 'D8.2 Lookahead contamination past asOf reference', dim: 'future_data', series: generateFutureSeries(5, BASE_TIMESTAMP, 60_000), config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: false },
  { id: 'D8.3 Multiple future candles past asOf reference', dim: 'future_data', series: generateFutureSeries(5, BASE_TIMESTAMP, 180_000), config: { futureData: { asOf: BASE_TIMESTAMP } }, pass: false },
  { id: 'D8.4 Future check with non-finite asOf reference', dim: 'future_data', series: generateMonotonicCandles(5), config: { futureData: { asOf: Number.NaN } }, pass: false },
  { id: 'D8.5 Non-finite timestamp in future check', dim: 'future_data', series: [c(BASE_TIMESTAMP), c(Number.NaN)], config: { futureData: { asOf: BASE_TIMESTAMP + 100_000 } }, pass: false },
  // D9: exchange_outage
  { id: 'D9.1 Normal dynamic price action without outage', dim: 'exchange_outage', series: generateMonotonicCandles(5), pass: true },
  { id: 'D9.2 Outage detected with 3 identical consecutive bars', dim: 'exchange_outage', series: generateOutageSeries(5, 3, 1), pass: false },
  { id: 'D9.3 Outage streak starting at initial index 0', dim: 'exchange_outage', series: generateOutageSeries(5, 3, 0), pass: false },
  { id: 'D9.4 Outage streak ending at terminal index', dim: 'exchange_outage', series: generateOutageSeries(5, 3, 2), pass: false },
  { id: 'D9.5 Invalid outage config with zero threshold', dim: 'exchange_outage', series: generateMonotonicCandles(5), config: { outage: { maxConsecutiveIdenticalBars: 0 } }, pass: false },
];

export function registerTier1FeatureCoverageTests(): void {
  describe('Tier 1: Feature Coverage (45 tests across 9 dimensions)', () => {
    for (const tc of TIER1_CASES) {
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
