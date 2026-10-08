/**
 * Empirical Adversarial Challenger Suite for Milestone 3: 4-Tier E2E Test Suite & Signal Fence
 * Roles: critic, specialist
 * Challenger ID: challenger_m3_1
 */

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

function recordTest(
  id: string,
  category: string,
  description: string,
  passed: boolean,
  details: string,
): void {
  results.push({ id, category, description, passed, details });
}

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

// ============================================================================
// SUITE 1: Adversarial Stress-Testing of protectSignalGeneration Signal Fence
// ============================================================================

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
  // Monotonicity attacks
  {
    id: 'FENCE-01',
    name: 'Backward step in candle timestamps',
    series: [c(1000), c(3000), c(2000)],
    expectedDimension: 'timestamp_monotonicity',
  },
  {
    id: 'FENCE-02',
    name: 'Non-finite NaN timestamp',
    series: [c(1000), c(Number.NaN)],
    expectedDimension: 'timestamp_monotonicity',
  },
  {
    id: 'FENCE-03',
    name: 'Infinity timestamp',
    series: [c(1000), c(Number.POSITIVE_INFINITY)],
    expectedDimension: 'timestamp_monotonicity',
  },
  {
    id: 'FENCE-04',
    name: 'Negative Infinity timestamp',
    series: [c(Number.NEGATIVE_INFINITY), c(1000)],
    expectedDimension: 'timestamp_monotonicity',
  },
  {
    id: 'FENCE-05',
    name: 'Shuffled candle series',
    series: [c(4000), c(1000), c(3000), c(2000)],
    expectedDimension: 'timestamp_monotonicity',
  },
  // Duplicate attacks
  {
    id: 'FENCE-06',
    name: 'Consecutive duplicate timestamps',
    series: generateDuplicateSeries(5, 1, 2),
    expectedDimension: 'duplicate_candles',
  },
  {
    id: 'FENCE-07',
    name: 'Distant duplicate timestamps across series',
    series: generateDuplicateSeries(10, 0, 9),
    expectedDimension: 'duplicate_candles',
  },
  {
    id: 'FENCE-08',
    name: 'All identical timestamps in series',
    series: [c(5000), c(5000), c(5000), c(5000)],
    expectedDimension: 'duplicate_candles',
  },
  // Missing intervals attacks
  {
    id: 'FENCE-09',
    name: 'Unannounced 3-hour gap in 1m series',
    series: generateGappedSeries(10, 4, 180, 60_000),
    config: { timeframe: '1m' },
    expectedDimension: 'missing_intervals',
  },
  {
    id: 'FENCE-10',
    name: 'Gap exceeding tolerance ratio (delta 100_000ms on 60_000ms cadence)',
    series: [c(1000), c(101_000)],
    config: { missingIntervals: { expectedIntervalMs: 60_000, toleranceRatio: 0.1 } },
    expectedDimension: 'missing_intervals',
  },
  // Stale data attacks
  {
    id: 'FENCE-11',
    name: 'Feed stopped 10 minutes ago relative to asOf',
    series: generateStaleSeries(5, BASE_TIMESTAMP + 600_000, 600_000),
    asOf: BASE_TIMESTAMP + 600_000,
    config: { staleness: { asOf: BASE_TIMESTAMP + 600_000, maxStalenessMs: 60_000 } },
    expectedDimension: 'stale_data',
  },
  {
    id: 'FENCE-12',
    name: 'Feed exceeds timeframe staleness multiplier',
    series: generateStaleSeries(5, BASE_TIMESTAMP + 300_000, 180_000),
    asOf: BASE_TIMESTAMP + 300_000,
    config: { staleness: { asOf: BASE_TIMESTAMP + 300_000, timeframe: '1m', maxStaleIntervals: 2 } },
    expectedDimension: 'stale_data',
  },
  {
    id: 'FENCE-13',
    name: 'Empty series with explicit asOf reference time',
    series: [],
    asOf: BASE_TIMESTAMP,
    expectedDimension: 'stale_data',
  },
  // Impossible OHLC attacks
  {
    id: 'FENCE-14',
    name: 'High < Low inverted bar',
    series: generateCorruptedOHLCSeries('high_lt_low'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-15',
    name: 'High < max(Open, Close) geometric violation',
    series: generateCorruptedOHLCSeries('high_lt_oc'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-16',
    name: 'Low > min(Open, Close) geometric violation',
    series: generateCorruptedOHLCSeries('low_gt_oc'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-17',
    name: 'Negative price tick in Open',
    series: generateCorruptedOHLCSeries('negative_price'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-18',
    name: 'Zero price tick in High',
    series: generateCorruptedOHLCSeries('zero_price'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-19',
    name: 'NaN price in Close',
    series: generateCorruptedOHLCSeries('nan_price'),
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-20',
    name: 'Infinity price in High',
    series: [c(1000, { high: Number.POSITIVE_INFINITY })],
    expectedDimension: 'impossible_ohlc',
  },
  {
    id: 'FENCE-21',
    name: 'Negative Infinity price in Low',
    series: [c(1000, { low: Number.NEGATIVE_INFINITY })],
    expectedDimension: 'impossible_ohlc',
  },
  // Volume anomaly attacks
  {
    id: 'FENCE-22',
    name: 'Negative volume tick',
    series: generateVolumeAnomalySeries('negative'),
    expectedDimension: 'volume_anomalies',
  },
  {
    id: 'FENCE-23',
    name: 'NaN volume tick',
    series: generateVolumeAnomalySeries('nan_volume'),
    expectedDimension: 'volume_anomalies',
  },
  {
    id: 'FENCE-24',
    name: 'Infinity volume tick',
    series: [c(1000, { volume: Number.POSITIVE_INFINITY })],
    expectedDimension: 'volume_anomalies',
  },
  {
    id: 'FENCE-25',
    name: 'Isolated zero volume bar in active liquid feed',
    series: generateVolumeAnomalySeries('isolated_zero'),
    config: { volume: { flagIsolatedZeroVolume: true } },
    expectedDimension: 'volume_anomalies',
  },
  {
    id: 'FENCE-26',
    name: 'Zero volume bar when zero disallowed',
    series: generateVolumeAnomalySeries('isolated_zero'),
    config: { volume: { allowZeroVolume: false } },
    expectedDimension: 'volume_anomalies',
  },
  {
    id: 'FENCE-27',
    name: 'Zero volume streak exceeding max threshold',
    series: generateVolumeAnomalySeries('consecutive_zeros'),
    config: { volume: { maxConsecutiveZeroVolume: 2 } },
    expectedDimension: 'volume_anomalies',
  },
  // Cross-source alignment attacks
  {
    id: 'FENCE-28',
    name: 'Secondary series timestamp skew > toleranceMs',
    series: generateMultiFeedPairs(5).primary,
    secondary: generateMultiFeedPairs(5, { secondarySkewMs: 10_000 }).secondary,
    config: { alignment: { toleranceMs: 2_000 } },
    expectedDimension: 'cross_source_alignment',
  },
  {
    id: 'FENCE-29',
    name: 'Secondary series length discrepancy > maxUnmatchedCandles',
    series: generateMultiFeedPairs(5).primary,
    secondary: generateMultiFeedPairs(5, { dropSecondaryIndex: 1 }).secondary,
    config: { alignment: { maxUnmatchedCandles: 0 } },
    expectedDimension: 'cross_source_alignment',
  },
  {
    id: 'FENCE-30',
    name: 'Secondary series completely empty while primary has bars',
    series: generateMonotonicCandles(5),
    secondary: [],
    expectedDimension: 'cross_source_alignment',
  },
  // Future data attacks
  {
    id: 'FENCE-31',
    name: 'Future candle timestamp 1ms past asOf',
    series: [c(BASE_TIMESTAMP + 1)],
    asOf: BASE_TIMESTAMP,
    expectedDimension: 'future_data',
  },
  {
    id: 'FENCE-32',
    name: 'Multiple future candles ahead of asOf',
    series: generateFutureSeries(5, BASE_TIMESTAMP, 120_000),
    asOf: BASE_TIMESTAMP,
    expectedDimension: 'future_data',
  },
  {
    id: 'FENCE-33',
    name: 'Non-finite timestamp in future check',
    series: [c(BASE_TIMESTAMP), c(Number.NaN)],
    asOf: BASE_TIMESTAMP + 100_000,
    expectedDimension: 'future_data',
  },
  // Exchange outage attacks
  {
    id: 'FENCE-34',
    name: '3 consecutive identical OHLCV bars (matching engine freeze)',
    series: generateOutageSeries(5, 3, 1),
    config: { outage: { maxConsecutiveIdenticalBars: 3 } },
    expectedDimension: 'exchange_outage',
  },
  {
    id: 'FENCE-35',
    name: '5 consecutive identical bars starting at index 0',
    series: generateOutageSeries(6, 5, 0),
    config: { outage: { maxConsecutiveIdenticalBars: 3 } },
    expectedDimension: 'exchange_outage',
  },
  // Compound Meltdown attack
  {
    id: 'FENCE-36',
    name: 'Total 9-dimension meltdown series',
    series: [
      c(1000, { volume: -10, high: 50, low: 60 }),
      c(1000),
      c(500_000, { close: 100 }),
      c(500_001, { close: 100 }),
      c(500_002, { close: 100 }),
      c(2000),
    ],
    secondary: [c(50), c(60)],
    asOf: 10_000,
    config: {
      missingIntervals: { expectedIntervalMs: 60_000 },
      volume: { allowZeroVolume: false },
      outage: { maxConsecutiveIdenticalBars: 3 },
      alignment: { toleranceMs: 10 },
      staleness: { asOf: 10_000, maxStalenessMs: 100 },
    },
    expectedDimension: 'timestamp_monotonicity',
  },
  // Secondary Series NaN Blindspot Attack
  {
    id: 'FENCE-37',
    name: 'Secondary series with all NaN timestamps (Multi-feed desync exploit)',
    series: generateMonotonicCandles(3),
    secondary: [c(Number.NaN), c(Number.NaN), c(Number.NaN)],
    config: { alignment: { toleranceMs: 50 } },
    expectedDimension: 'cross_source_alignment',
  },
  // Empty Series without asOf Reference Exploit
  {
    id: 'FENCE-38',
    name: 'Completely empty candle series without asOf reference time',
    series: [],
    expectedDimension: 'stale_data',
  },
];

function runSignalFenceStressTests(): void {
  for (const tc of ADVERSARIAL_FENCE_CASES) {
    let generatorCalled = false;
    let receivedSeries: readonly Candle[] | null = null;

    const dummyGenerator = (s: readonly Candle[]): { action: string; price: number } => {
      generatorCalled = true;
      receivedSeries = s;
      return { action: 'BUY', price: 99_999 };
    };

    const input = {
      series: tc.series,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: tc.asOf,
      secondarySeries: tc.secondary,
    };

    let caughtError: unknown = null;
    let result: ReturnType<typeof protectSignalGeneration> | null = null;
    try {
      result = protectSignalGeneration(input, dummyGenerator, tc.config);
    } catch (err) {
      caughtError = err;
    }

    if (caughtError) {
      // It threw an error instead of returning a structured DATA_INVALID result!
      recordTest(
        tc.id,
        'protectSignalGeneration Fail-Closed Fence',
        tc.name,
        false,
        `UNCAUGHT_THROW: Threw error instead of returning structured DATA_INVALID: ${caughtError instanceof Error ? caughtError.message : String(caughtError)} (generatorCalled=${generatorCalled})`,
      );
      continue;
    }

    if (!result) continue;

    const isFailClosed = result.status === 'DATA_INVALID' && result.signal === null;
    const isGeneratorBlocked = !generatorCalled && receivedSeries === null;
    const hasExpectedViolation = result.report.validationResult.violations.some(
      (v) => v.dimension === tc.expectedDimension,
    );

    const passed = isFailClosed && isGeneratorBlocked && hasExpectedViolation;
    const details = `status=${result.status}, signal=${JSON.stringify(result.signal)}, generatorCalled=${generatorCalled}, violationFound=${hasExpectedViolation} (${tc.expectedDimension})`;

    recordTest(
      tc.id,
      'protectSignalGeneration Fail-Closed Fence',
      tc.name,
      passed,
      details,
    );
  }
}

// ============================================================================
// SUITE 2: Positive Signal Generation Sanity (Happy Path)
// ============================================================================

function runPositiveFenceTests(): void {
  const goodSeries = generateMonotonicCandles(10, BASE_TIMESTAMP, 60_000);
  let generatorCalled = false;

  const result = protectSignalGeneration(
    {
      series: goodSeries,
      symbol: 'ETH/USDT',
      timeframe: '1m',
      asOf: goodSeries[9].timestamp,
    },
    (s) => {
      generatorCalled = true;
      return { signalId: 'ALPHA_01', candleCount: s.length };
    },
  );

  const passed =
    result.status === 'VALID' &&
    generatorCalled &&
    result.signal !== null &&
    (result.signal as { signalId: string }).signalId === 'ALPHA_01';

  recordTest(
    'FENCE-POS-01',
    'protectSignalGeneration Positive Flow',
    'Invokes generator exactly once on clean data and returns valid payload',
    passed,
    `status=${result.status}, generatorCalled=${generatorCalled}, signal=${JSON.stringify(result.signal)}`,
  );
}

// ============================================================================
// SUITE 3: Deep Edge-Case Robustness Across All 9 Dimensions
// ============================================================================

function runNineDimensionsRobustness(): void {
  // D1: Monotonicity with microscopic 1ms decrement
  {
    const res = validateCandleSeries([c(100_000), c(99_999)], { enabledDimensions: ['timestamp_monotonicity'] });
    recordTest('ROBUST-D1', 'Edge Cases', 'D1 detects 1ms backwards step', !res.valid && res.violations.some(v => v.dimension === 'timestamp_monotonicity'), `diff=-1ms, valid=${res.valid}`);
  }

  // D2: Duplicates at massive series extremes
  {
    const bigSeries = generateMonotonicCandles(100, 1000, 100);
    bigSeries[99] = { ...bigSeries[99], timestamp: bigSeries[0].timestamp };
    const res = validateCandleSeries(bigSeries, { enabledDimensions: ['duplicate_candles'] });
    recordTest('ROBUST-D2', 'Edge Cases', 'D2 detects duplicate between index 0 and 99', !res.valid && res.violations.some(v => v.dimension === 'duplicate_candles'), `valid=${res.valid}, violations=${res.violations.length}`);
  }

  // D3: Missing intervals with custom timeframe '4h'
  {
    const step4h = 4 * 3600 * 1000;
    const series4h = [c(1000), c(1000 + step4h), c(1000 + step4h * 3)]; // Missing 1 bar
    const res = validateCandleSeries(series4h, { enabledDimensions: ['missing_intervals'], timeframe: '4h' });
    recordTest('ROBUST-D3', 'Edge Cases', 'D3 detects missing 4h interval gap', !res.valid && res.violations.some(v => v.dimension === 'missing_intervals'), `valid=${res.valid}`);
  }

  // D4: Staleness with exact 0ms delta (latestCandle.timestamp === asOf)
  {
    const res = validateCandleSeries([c(5000)], { asOf: 5000, staleness: { asOf: 5000, maxStalenessMs: 1000 }, enabledDimensions: ['stale_data'] });
    recordTest('ROBUST-D4', 'Edge Cases', 'D4 passes when latest timestamp exactly equals asOf', res.valid && res.violations.length === 0, `valid=${res.valid}`);
  }

  // D4: Staleness with maxStalenessMs = 0 (zero tolerance) on 1000ms stale data
  {
    const res = validateCandleSeries([c(1000)], { asOf: 2000, staleness: { asOf: 2000, maxStalenessMs: 0 }, enabledDimensions: ['stale_data'] });
    recordTest('ROBUST-D4-ZERO', 'Edge Cases', 'D4 rejects 1000ms stale data when maxStalenessMs is 0', !res.valid && res.violations.some(v => v.dimension === 'stale_data'), `valid=${res.valid}, violations=${res.violations.length}`);
  }

  // D5: Impossible OHLC with microscopic subnormal price 1e-12
  {
    const res = validateCandleSeries([c(1000, { open: 1e-12, high: 2e-12, low: 1e-12, close: 1.5e-12 })], { enabledDimensions: ['impossible_ohlc'] });
    recordTest('ROBUST-D5', 'Edge Cases', 'D5 passes on valid microscopic float price (1e-12)', res.valid, `valid=${res.valid}`);
  }

  // D6: Volume anomaly with non-finite volume NaN
  {
    const res = validateCandleSeries([c(1000, { volume: Number.NaN })], { enabledDimensions: ['volume_anomalies'] });
    recordTest('ROBUST-D6', 'Edge Cases', 'D6 rejects NaN volume', !res.valid && res.violations.some(v => v.dimension === 'volume_anomalies'), `valid=${res.valid}`);
  }

  // D7: Alignment with empty primary and non-empty secondary
  {
    const res = validateCandleSeries([], { enabledDimensions: ['cross_source_alignment'] }, [c(1000)]);
    recordTest('ROBUST-D7', 'Edge Cases', 'D7 rejects empty primary when secondary has candles', !res.valid && res.violations.some(v => v.dimension === 'cross_source_alignment'), `valid=${res.valid}`);
  }

  // D8: Future data with timestamp exactly equal to asOf
  {
    const res = validateCandleSeries([c(5000)], { asOf: 5000, enabledDimensions: ['future_data'] });
    recordTest('ROBUST-D8', 'Edge Cases', 'D8 passes when candle timestamp is exactly at asOf boundary', res.valid && res.violations.length === 0, `valid=${res.valid}`);
  }

  // D9: Outage with streak broken by single tick volume fluctuation
  {
    const series = [c(1000, { volume: 100 }), c(2000, { volume: 100 }), c(3000, { volume: 100.001 })];
    const res = validateCandleSeries(series, { outage: { maxConsecutiveIdenticalBars: 3 }, enabledDimensions: ['exchange_outage'] });
    recordTest('ROBUST-D9', 'Edge Cases', 'D9 passes when volume fluctuation breaks identical bar streak', res.valid, `valid=${res.valid}`);
  }
}

// ============================================================================
// SUITE 4: Input Immutability & Defense-in-Depth
// ============================================================================

function runImmutabilityAndDefenseTests(): void {
  const original = Object.freeze([
    Object.freeze(c(1000, { close: 101 })),
    Object.freeze(c(2000, { close: 102 })),
    Object.freeze(c(3000, { close: 103 })),
  ]);

  let pass = true;
  try {
    const report = evaluateDataQuality({
      series: original,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: 3000,
    });
    if (report.status !== 'VALID') pass = false;
  } catch {
    pass = false;
  }

  recordTest(
    'DEFENSE-01',
    'Immutability',
    'Validator executes on deeply frozen Object.freeze candle series without mutation or error',
    pass,
    `pass=${pass}`,
  );
}

// ============================================================================
// SUITE 5: Report Generation Integrity
// ============================================================================

function runReportIntegrityTests(): void {
  const report = evaluateDataQuality({
    series: [c(1000, { high: 50, low: 60 })],
    symbol: 'DOT/USDT',
    timeframe: '5m',
  });

  const markdown = generateDataQualityReport(report);
  const containsHeader = markdown.includes('# Data Quality Assessment Report');
  const containsSymbol = markdown.includes('DOT/USDT');
  const containsStatus = markdown.includes('DATA_INVALID');
  const containsDim = markdown.includes('impossible_ohlc');
  const containsRecommendation = markdown.includes('Cleanse corrupted OHLC ticks');

  const passed =
    containsHeader && containsSymbol && containsStatus && containsDim && containsRecommendation;

  recordTest(
    'REPORT-01',
    'Report Generation',
    'generateDataQualityReport includes all diagnostic metadata and actionable recommendations',
    passed,
    `header=${containsHeader}, symbol=${containsSymbol}, status=${containsStatus}, dim=${containsDim}, rec=${containsRecommendation}`,
  );
}

// ============================================================================
// EXECUTION & SUMMARY
// ============================================================================

export function runEmpiricalChallengerSuite(): {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly records: readonly TestResult[];
} {
  runSignalFenceStressTests();
  runPositiveFenceTests();
  runNineDimensionsRobustness();
  runImmutabilityAndDefenseTests();
  runReportIntegrityTests();

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  return { total, passed, failed, records: results };
}

if (require.main === module) {
  const summary = runEmpiricalChallengerSuite();
  process.stdout.write(`\n--- Empirical Adversarial Challenger Results ---\n`);
  process.stdout.write(`Total tests: ${summary.total}\n`);
  process.stdout.write(`Passed:      ${summary.passed}\n`);
  process.stdout.write(`Failed:      ${summary.failed}\n`);

  for (const r of summary.records) {
    const mark = r.passed ? '✓' : '✗';
    process.stdout.write(`[${mark}] ${r.id} (${r.category}) - ${r.description}: ${r.details}\n`);
  }

  if (summary.failed > 0) {
    process.exit(1);
  }
}
