import {
  evaluateDataQuality,
  protectSignalGeneration,
  generateDataQualityReport,
} from '../../src/forest/alpha/data-quality-eval';
import {
  validateCandleSeries,
  type Candle,
  type DataQualityConfig,
  type QualityDimension,
} from '../../src/tree/alpha/data-quality';
import {
  BASE_TIMESTAMP,
  createBaseCandle,
  generateMonotonicCandles,
  generateDuplicateSeries,
  generateGappedSeries,
  generateCorruptedOHLCSeries,
  generateVolumeAnomalySeries,
  generateMultiFeedPairs,
  generateOutageSeries,
  generateStaleSeries,
  generateFutureSeries,
} from './data-quality-fixtures';

interface TestResult {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly passed: boolean;
  readonly details: string;
}

const results: TestResult[] = [];
const recordTest = (id: string, category: string, description: string, passed: boolean, details: string): void => {
  results.push({ id, category, description, passed, details });
};
const c = (ts: number, overrides?: Partial<Candle>): Candle => createBaseCandle({ timestamp: ts, ...overrides });

interface AdversarialFenceCase {
  readonly id: string;
  readonly name: string;
  readonly series: readonly Candle[];
  readonly config?: DataQualityConfig;
  readonly secondary?: readonly Candle[];
  readonly asOf?: number;
  readonly expectedDimension: QualityDimension;
}

const ADVERSARIAL_FENCE_CASES: readonly AdversarialFenceCase[] = [
  { id: 'FENCE-01', name: 'Backward step in timestamps', series: [c(1000), c(3000), c(2000)], expectedDimension: 'timestamp_monotonicity' },
  { id: 'FENCE-02', name: 'Non-finite NaN timestamp', series: [c(1000), c(Number.NaN)], expectedDimension: 'timestamp_monotonicity' },
  { id: 'FENCE-03', name: 'Infinity timestamp', series: [c(1000), c(Number.POSITIVE_INFINITY)], expectedDimension: 'timestamp_monotonicity' },
  { id: 'FENCE-04', name: 'Negative Infinity timestamp', series: [c(Number.NEGATIVE_INFINITY), c(1000)], expectedDimension: 'timestamp_monotonicity' },
  { id: 'FENCE-05', name: 'Shuffled candle series', series: [c(4000), c(1000), c(3000), c(2000)], expectedDimension: 'timestamp_monotonicity' },
  { id: 'FENCE-06', name: 'Consecutive duplicate timestamps', series: generateDuplicateSeries(5, 1, 2), expectedDimension: 'duplicate_candles' },
  { id: 'FENCE-07', name: 'Distant duplicate timestamps', series: generateDuplicateSeries(10, 0, 9), expectedDimension: 'duplicate_candles' },
  { id: 'FENCE-08', name: 'All identical timestamps', series: [c(5000), c(5000), c(5000), c(5000)], expectedDimension: 'duplicate_candles' },
  { id: 'FENCE-09', name: '3-hour gap in 1m series', series: generateGappedSeries(10, 4, 180, 60_000), config: { timeframe: '1m' }, expectedDimension: 'missing_intervals' },
  { id: 'FENCE-10', name: 'Gap exceeding tolerance ratio', series: [c(1000), c(101_000)], config: { missingIntervals: { expectedIntervalMs: 60_000, toleranceRatio: 0.1 } }, expectedDimension: 'missing_intervals' },
  { id: 'FENCE-11', name: 'Feed stopped 10m ago', series: generateStaleSeries(5, BASE_TIMESTAMP + 600_000, 600_000), asOf: BASE_TIMESTAMP + 600_000, config: { staleness: { asOf: BASE_TIMESTAMP + 600_000, maxStalenessMs: 60_000 } }, expectedDimension: 'stale_data' },
  { id: 'FENCE-12', name: 'Exceeds timeframe staleness multiplier', series: generateStaleSeries(5, BASE_TIMESTAMP + 300_000, 180_000), asOf: BASE_TIMESTAMP + 300_000, config: { staleness: { asOf: BASE_TIMESTAMP + 300_000, timeframe: '1m', maxStaleIntervals: 2 } }, expectedDimension: 'stale_data' },
  { id: 'FENCE-13', name: 'Empty series with explicit asOf', series: [], asOf: BASE_TIMESTAMP, expectedDimension: 'stale_data' },
  { id: 'FENCE-14', name: 'High < Low inverted bar', series: generateCorruptedOHLCSeries('high_lt_low'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-15', name: 'High < max(Open, Close)', series: generateCorruptedOHLCSeries('high_lt_oc'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-16', name: 'Low > min(Open, Close)', series: generateCorruptedOHLCSeries('low_gt_oc'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-17', name: 'Negative price tick in Open', series: generateCorruptedOHLCSeries('negative_price'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-18', name: 'Zero price tick in High', series: generateCorruptedOHLCSeries('zero_price'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-19', name: 'NaN price in Close', series: generateCorruptedOHLCSeries('nan_price'), expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-20', name: 'Infinity price in High', series: [c(1000, { high: Number.POSITIVE_INFINITY })], expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-21', name: 'Negative Infinity price in Low', series: [c(1000, { low: Number.NEGATIVE_INFINITY })], expectedDimension: 'impossible_ohlc' },
  { id: 'FENCE-22', name: 'Negative volume tick', series: generateVolumeAnomalySeries('negative'), expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-23', name: 'NaN volume tick', series: generateVolumeAnomalySeries('nan_volume'), expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-24', name: 'Infinity volume tick', series: [c(1000, { volume: Number.POSITIVE_INFINITY })], expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-25', name: 'Isolated zero volume bar', series: generateVolumeAnomalySeries('isolated_zero'), config: { volume: { flagIsolatedZeroVolume: true } }, expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-26', name: 'Zero volume bar when disallowed', series: generateVolumeAnomalySeries('isolated_zero'), config: { volume: { allowZeroVolume: false } }, expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-27', name: 'Zero volume streak exceeding max', series: generateVolumeAnomalySeries('consecutive_zeros'), config: { volume: { maxConsecutiveZeroVolume: 2 } }, expectedDimension: 'volume_anomalies' },
  { id: 'FENCE-28', name: 'Secondary timestamp skew > toleranceMs', series: generateMultiFeedPairs(5).primary, secondary: generateMultiFeedPairs(5, { secondarySkewMs: 10_000 }).secondary, config: { alignment: { toleranceMs: 2_000 } }, expectedDimension: 'cross_source_alignment' },
  { id: 'FENCE-29', name: 'Secondary length discrepancy > maxUnmatchedCandles', series: generateMultiFeedPairs(5).primary, secondary: generateMultiFeedPairs(5, { dropSecondaryIndex: 1 }).secondary, config: { alignment: { maxUnmatchedCandles: 0 } }, expectedDimension: 'cross_source_alignment' },
  { id: 'FENCE-30', name: 'Secondary series empty', series: generateMonotonicCandles(5), secondary: [], expectedDimension: 'cross_source_alignment' },
  { id: 'FENCE-31', name: 'Future candle 1ms past asOf', series: [c(BASE_TIMESTAMP + 1)], asOf: BASE_TIMESTAMP, expectedDimension: 'future_data' },
  { id: 'FENCE-32', name: 'Multiple future candles ahead of asOf', series: generateFutureSeries(5, BASE_TIMESTAMP, 120_000), asOf: BASE_TIMESTAMP, expectedDimension: 'future_data' },
  { id: 'FENCE-33', name: 'Non-finite timestamp in future check', series: [c(BASE_TIMESTAMP), c(Number.NaN)], asOf: BASE_TIMESTAMP + 100_000, expectedDimension: 'future_data' },
  { id: 'FENCE-34', name: '3 consecutive identical OHLCV bars', series: generateOutageSeries(5, 3, 1), config: { outage: { maxConsecutiveIdenticalBars: 3 } }, expectedDimension: 'exchange_outage' },
  { id: 'FENCE-35', name: '5 consecutive identical bars at index 0', series: generateOutageSeries(6, 5, 0), config: { outage: { maxConsecutiveIdenticalBars: 3 } }, expectedDimension: 'exchange_outage' },
  { id: 'FENCE-37', name: 'Secondary series with all NaN timestamps', series: generateMonotonicCandles(3), secondary: [c(Number.NaN), c(Number.NaN), c(Number.NaN)], config: { alignment: { toleranceMs: 50 } }, expectedDimension: 'cross_source_alignment' },
  { id: 'FENCE-38', name: 'Empty candle series without asOf', series: [], expectedDimension: 'stale_data' },
];

export function runEmpiricalChallengerSuite(): {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly records: readonly TestResult[];
} {
  for (const tc of ADVERSARIAL_FENCE_CASES) {
    let generatorCalled = false;
    const result = protectSignalGeneration(
      { series: tc.series, symbol: 'BTC/USDT', timeframe: '1m', asOf: tc.asOf, secondarySeries: tc.secondary },
      () => { generatorCalled = true; return { action: 'BUY', price: 99_999 }; },
      tc.config,
    );
    const hasExpectedViolation = result.report.validationResult.violations.some((v) => v.dimension === tc.expectedDimension);
    const passed = result.status === 'DATA_INVALID' && result.signal === null && !generatorCalled && hasExpectedViolation;
    recordTest(tc.id, 'Signal Fence', tc.name, passed, `status=${result.status}`);
  }

  const goodSeries = generateMonotonicCandles(10, BASE_TIMESTAMP, 60_000);
  let posCalled = false;
  const posRes = protectSignalGeneration(
    { series: goodSeries, symbol: 'ETH/USDT', timeframe: '1m', asOf: goodSeries[9].timestamp },
    (s) => { posCalled = true; return { signalId: 'ALPHA_01', candleCount: s.length }; },
  );
  recordTest('FENCE-POS-01', 'Positive Flow', 'Invokes generator once on clean data', posRes.status === 'VALID' && posCalled && posRes.signal?.signalId === 'ALPHA_01', `status=${posRes.status}`);

  recordTest('ROBUST-D1', 'Edge Cases', 'D1 detects 1ms backwards step', !validateCandleSeries([c(100_000), c(99_999)], { enabledDimensions: ['timestamp_monotonicity'] }).valid, 'D1');
  recordTest('ROBUST-D4', 'Edge Cases', 'D4 passes when latest timestamp equals asOf', validateCandleSeries([c(5000)], { asOf: 5000, staleness: { asOf: 5000, maxStalenessMs: 1000 }, enabledDimensions: ['stale_data'] }).valid, 'D4');
  recordTest('ROBUST-D5', 'Edge Cases', 'D5 passes on valid microscopic float price', validateCandleSeries([c(1000, { open: 1e-12, high: 2e-12, low: 1e-12, close: 1.5e-12 })], { enabledDimensions: ['impossible_ohlc'] }).valid, 'D5');

  const md = generateDataQualityReport(evaluateDataQuality({ series: [c(1000, { high: 50, low: 60 })], symbol: 'DOT/USDT', timeframe: '5m' }));
  recordTest('REPORT-01', 'Report', 'Includes diagnostic metadata and recommendation', md.includes('# Data Quality Assessment Report') && md.includes('DOT/USDT') && md.includes('impossible_ohlc'), 'Report');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return { total, passed, failed: total - passed, records: results };
}

if (require.main === module) {
  const summary = runEmpiricalChallengerSuite();
  process.stdout.write(`Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}\n`);
  if (summary.failed > 0) process.exit(1);
}
