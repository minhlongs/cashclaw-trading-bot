import { describe, expect, it } from 'vitest';
import {
  type Candle,
  type DataQualityConfig,
  type QualityDimension,
  validateCandleSeries,
} from '@/tree/alpha/data-quality';
import { createBaseCandle, generateMonotonicCandles, generateMultiFeedPairs } from './data-quality-fixtures';

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

interface PairwiseCase {
  readonly id: string;
  readonly name: string;
  readonly series: readonly Candle[];
  readonly config?: DataQualityConfig;
  readonly secondary?: readonly Candle[];
  readonly expectedFailedDimensions: readonly QualityDimension[];
}

const ALL_9_DIMS: readonly QualityDimension[] = [
  'timestamp_monotonicity', 'duplicate_candles', 'missing_intervals', 'stale_data',
  'impossible_ohlc', 'volume_anomalies', 'cross_source_alignment', 'future_data', 'exchange_outage',
];

const PAIRWISE_CASES: readonly PairwiseCase[] = [
  { id: 'P01', name: 'Stale + Future', series: [c(5000), c(1000)], config: { asOf: 3000, staleness: { asOf: 3000, maxStalenessMs: 500 }, futureData: { asOf: 3000 } }, expectedFailedDimensions: ['stale_data', 'future_data'] },
  { id: 'P02', name: 'Missing interval + Duplicate', series: [c(1000), c(1000 + 600_000), c(1000 + 600_000)], config: { missingIntervals: { expectedIntervalMs: 60_000, toleranceRatio: 0.1 } }, expectedFailedDimensions: ['missing_intervals', 'duplicate_candles'] },
  { id: 'P03', name: 'Impossible OHLC + Negative Volume', series: [c(1000, { high: 80, low: 90, volume: -50 })], expectedFailedDimensions: ['impossible_ohlc', 'volume_anomalies'] },
  { id: 'P04', name: 'Exchange outage + Stale data', series: [c(1000, { close: 100 }), c(2000, { close: 100 }), c(3000, { close: 100 })], config: { asOf: 100_000, staleness: { asOf: 100_000, maxStalenessMs: 1000 }, outage: { maxConsecutiveIdenticalBars: 3 } }, expectedFailedDimensions: ['exchange_outage', 'stale_data'] },
  { id: 'P05', name: 'Monotonicity backwards + Duplicate', series: [c(1000), c(1000)], expectedFailedDimensions: ['timestamp_monotonicity', 'duplicate_candles'] },
  { id: 'P06', name: 'Alignment mismatch + Missing interval', series: [c(1000), c(1000 + 300_000)], secondary: [c(1000), c(1000 + 50_000)], config: { missingIntervals: { expectedIntervalMs: 60_000 }, alignment: { toleranceMs: 1000 } }, expectedFailedDimensions: ['cross_source_alignment', 'missing_intervals'] },
  { id: 'P07', name: 'Future data + Impossible OHLC', series: [c(5000, { high: 90, open: 100, close: 95 })], config: { futureData: { asOf: 3000 } }, expectedFailedDimensions: ['future_data', 'impossible_ohlc'] },
  { id: 'P08', name: 'Volume anomaly (isolated zero) + Missing interval', series: [c(1000, { volume: 100 }), c(2000, { volume: 0 }), c(2000 + 300_000, { volume: 100 })], config: { volume: { flagIsolatedZeroVolume: true }, missingIntervals: { expectedIntervalMs: 60_000 } }, expectedFailedDimensions: ['volume_anomalies', 'missing_intervals'] },
  { id: 'P09', name: 'Exchange outage + Disallowed zero volume', series: [c(1000, { volume: 0 }), c(2000, { volume: 0 }), c(3000, { volume: 0 })], config: { volume: { allowZeroVolume: false }, outage: { maxConsecutiveIdenticalBars: 3 } }, expectedFailedDimensions: ['exchange_outage', 'volume_anomalies'] },
  { id: 'P10', name: 'Alignment drift + Future data', series: [c(5000)], secondary: [c(4000)], config: { alignment: { toleranceMs: 50 }, futureData: { asOf: 3000 } }, expectedFailedDimensions: ['cross_source_alignment', 'future_data'] },
  { id: 'P11', name: 'Triple: Monotonicity + Duplicate + Impossible OHLC', series: [c(2000), c(1000, { open: -10, low: -15 })], expectedFailedDimensions: ['timestamp_monotonicity', 'impossible_ohlc'] },
  { id: 'P12', name: 'Triple: Stale + Missing interval + Zero volume', series: [c(1000, { volume: 0 }), c(1000 + 300_000, { volume: 0 })], config: { asOf: 1_000_000, staleness: { asOf: 1_000_000, maxStalenessMs: 5000 }, missingIntervals: { expectedIntervalMs: 60_000 }, volume: { allowZeroVolume: false } }, expectedFailedDimensions: ['stale_data', 'missing_intervals', 'volume_anomalies'] },
  { id: 'P13', name: 'Triple: Future data + Outage + Alignment drift', series: [c(5000), c(6000), c(7000)], secondary: [c(1000), c(2000), c(3000)], config: { futureData: { asOf: 4000 }, outage: { maxConsecutiveIdenticalBars: 3 }, alignment: { toleranceMs: 100 } }, expectedFailedDimensions: ['future_data', 'exchange_outage', 'cross_source_alignment'] },
  { id: 'P14', name: 'Quad: Monotonicity + Duplicate + Missing gap + Negative price', series: [c(1000), c(500_000, { open: -5 }), c(500_000), c(2000)], config: { missingIntervals: { expectedIntervalMs: 60_000 } }, expectedFailedDimensions: ['timestamp_monotonicity', 'duplicate_candles', 'missing_intervals', 'impossible_ohlc'] },
  { id: 'P15', name: 'Quad: Stale + Zero volume + Outage + Cross-source desync', series: [c(1000, { volume: 0 }), c(2000, { volume: 0 }), c(3000, { volume: 0 })], secondary: [c(50_000), c(60_000), c(70_000)], config: { asOf: 100_000, staleness: { asOf: 100_000, maxStalenessMs: 1000 }, volume: { allowZeroVolume: false }, outage: { maxConsecutiveIdenticalBars: 3 }, alignment: { toleranceMs: 50 } }, expectedFailedDimensions: ['stale_data', 'volume_anomalies', 'exchange_outage', 'cross_source_alignment'] },
  { id: 'P16', name: 'Pentuple: 5 simultaneous distinct violations', series: [c(1000, { volume: -1 }), c(500_000, { high: 80, low: 90 }), c(500_000), c(2000)], config: { missingIntervals: { expectedIntervalMs: 60_000 } }, expectedFailedDimensions: ['timestamp_monotonicity', 'duplicate_candles', 'missing_intervals', 'impossible_ohlc', 'volume_anomalies'] },
  { id: 'P17', name: 'Isolation: failing only cross-source alignment', series: generateMonotonicCandles(5), secondary: generateMultiFeedPairs(5, { secondarySkewMs: 10_000 }).secondary, config: { alignment: { toleranceMs: 50 } }, expectedFailedDimensions: ['cross_source_alignment'] },
  { id: 'P18', name: 'Isolation: failing only outage', series: [c(1000), c(2000), c(3000)], config: { outage: { maxConsecutiveIdenticalBars: 3 } }, expectedFailedDimensions: ['exchange_outage'] },
  { id: 'P19', name: 'Isolation: failing only isolated zero volume', series: [c(1000, { volume: 100 }), c(2000, { volume: 0 }), c(3000, { volume: 100 })], config: { volume: { flagIsolatedZeroVolume: true } }, expectedFailedDimensions: ['volume_anomalies'] },
  {
    id: 'P20',
    name: 'All 9 dimensions violated simultaneously in meltdown series',
    series: [c(1000, { volume: -10, high: 50, low: 60 }), c(1000), c(500_000, { close: 100 }), c(500_001, { close: 100 }), c(500_002, { close: 100 }), c(2000)],
    secondary: [c(50), c(60)],
    config: { asOf: 10_000, staleness: { asOf: 10_000, maxStalenessMs: 100 }, missingIntervals: { expectedIntervalMs: 60_000 }, volume: { allowZeroVolume: false }, outage: { maxConsecutiveIdenticalBars: 3 }, alignment: { toleranceMs: 10 }, futureData: { asOf: 10_000 } },
    expectedFailedDimensions: ALL_9_DIMS,
  },
];

export function registerTier3PairwiseTests(): void {
  describe('Tier 3: Cross-Feature Interactions & Pairwise Combinations (P01-P20)', () => {
    for (const tc of PAIRWISE_CASES) {
      it(`${tc.id}: ${tc.name}`, () => {
        const res = validateCandleSeries(tc.series, tc.config, tc.secondary);
        expect(res.valid).toBe(false);
        expect(res.status).toBe('DATA_INVALID');
        const failedDims = new Set(res.checkResults.filter((cr) => !cr.passed).map((cr) => cr.dimension));
        for (const expectedDim of tc.expectedFailedDimensions) {
          expect(failedDims.has(expectedDim), `Expected failed dimension ${expectedDim} not found in check results`).toBe(true);
        }
      });
    }
  });
}
