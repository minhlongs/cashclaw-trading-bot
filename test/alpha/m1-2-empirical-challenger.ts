/* eslint-disable no-console */
/**
 * Empirical Adversarial Challenger Suite for Milestone 1: Tree Data Quality Validators
 * Target: src/tree/alpha/data-quality/
 * Roles: critic, specialist
 * Challenger ID: challenger_m1_2
 */

import { validateAlignment } from '../../src/tree/alpha/data-quality/validate-alignment';
import { validateFutureData } from '../../src/tree/alpha/data-quality/validate-future-data';
import { validateOutage } from '../../src/tree/alpha/data-quality/validate-outage';
import { validateMonotonicity } from '../../src/tree/alpha/data-quality/validate-monotonicity';
import { validateDuplicates } from '../../src/tree/alpha/data-quality/validate-duplicates';
import { validateIntervals } from '../../src/tree/alpha/data-quality/validate-intervals';
import { validateStaleness } from '../../src/tree/alpha/data-quality/validate-staleness';
import { validateOHLC } from '../../src/tree/alpha/data-quality/validate-ohlc';
import { validateVolume } from '../../src/tree/alpha/data-quality/validate-volume';
import { validateCandleSeries } from '../../src/tree/alpha/data-quality/validator';
import type { Candle } from '../../src/tree/alpha/data-quality/types';

interface TestRecord {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  expected: boolean;
  actual: boolean;
  isBug: boolean;
  detail: string;
}

const records: TestRecord[] = [];

function assertTest(
  id: string,
  category: string,
  name: string,
  actualPassed: boolean,
  expectedPassed: boolean,
  detail: string,
  options?: { expectBug?: boolean }
) {
  const isMatch = actualPassed === expectedPassed;
  const isBug = !isMatch || !!options?.expectBug;

  records.push({
    id,
    category,
    name,
    passed: isMatch,
    expected: expectedPassed,
    actual: actualPassed,
    isBug,
    detail,
  });

  const status = isMatch ? 'PASS' : 'FAIL';
  const bugTag = isBug ? ' [DEFECT]' : '';
  console.log(`[${status}] [${id}] ${category} :: ${name}${bugTag}`);
  if (!isMatch) {
    console.log(`       Expected: ${expectedPassed}, Actual: ${actualPassed}. Detail: ${detail}`);
  }
}

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1_000,
    ...overrides,
  };
}

function makeSeries(count: number, intervalMs = 60_000, baseTs = 1_700_000_000_000): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      timestamp: baseTs + i * intervalMs,
      open: 100 + (i % 7),
      high: 110 + (i % 7),
      low: 90 + (i % 7),
      close: 105 + (i % 7),
      volume: 1_000 + (i % 10) * 10,
    });
  }
  return candles;
}

console.log('================================================================');
console.log('CHALLENGER M1-2: EMPIRICAL VALIDATION OF DATA QUALITY LAYER');
console.log('================================================================\n');

// ============================================================================
// SUITE 1: CROSS-SOURCE ALIGNMENT (D7)
// ============================================================================
console.log('--- SUITE 1: CROSS-SOURCE ALIGNMENT (D7) ---');

// D7-1: Exact alignment on large series (10,000 candles)
{
  const count = 10_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = makeSeries(count, 60_000, 1_700_000_000_000);
  const res = validateAlignment(primary, secondary, { toleranceMs: 0 });
  assertTest('D7-01', 'Alignment', '10,000 candles exact timestamp match with toleranceMs: 0', res.passed, true, `Violations: ${res.violations.length}`);
}

// D7-2: Jitter within tolerance on 10,000 candles
{
  const count = 10_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = primary.map((c, i) => ({
    ...c,
    timestamp: c.timestamp + (i % 2 === 0 ? 45 : -45),
  }));
  const res = validateAlignment(primary, secondary, { toleranceMs: 50 });
  assertTest('D7-02', 'Alignment', '10,000 candles jitter (+/-45ms) within toleranceMs: 50', res.passed, true, `Violations: ${res.violations.length}`);
}

// D7-3: Jitter exceeding tolerance on 10,000 candles
{
  const count = 10_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = primary.map((c, i) => ({
    ...c,
    timestamp: c.timestamp + (i % 2 === 0 ? 55 : -55),
  }));
  const res = validateAlignment(primary, secondary, { toleranceMs: 50 });
  assertTest('D7-03', 'Alignment', '10,000 candles jitter (+/-55ms) exceeding toleranceMs: 50', res.passed, false, `Violations: ${res.violations.length} (expected 10,000)`);
}

// D7-4: Single needle-in-haystack drift at index 7,500 in 10,000 candles
{
  const count = 10_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = makeSeries(count, 60_000, 1_700_000_000_000);
  secondary[7_500] = { ...secondary[7_500], timestamp: secondary[7_500].timestamp + 5_000 };
  const res = validateAlignment(primary, secondary, { toleranceMs: 100 });
  const indexMatch = res.violations.length === 1 && res.violations[0].index === 7_500;
  assertTest('D7-04', 'Alignment', 'Single drift anomaly at index 7,500 out of 10,000 candles', res.passed === false && indexMatch, true, `Found violation at: ${res.violations[0]?.index}, diff: ${res.violations[0]?.details?.diffMs}ms`);
}

// D7-5: BUG TEST: Asymmetric series length where secondary has 20 extra candles and maxUnmatchedCandles = 5
{
  const primary = makeSeries(5, 60_000, 1_000_000);
  const secondary = makeSeries(25, 60_000, 1_000_000); // 20 extra candles!
  const res = validateAlignment(primary, secondary, { maxUnmatchedCandles: 5 });
  const expectedFail = false;
  const actualPassed = res.passed;
  assertTest(
    'D7-05',
    'Alignment [BUG-1]',
    'Secondary has 20 extra candles when maxUnmatchedCandles=5 (MUST FAIL CLOSED)',
    actualPassed,
    expectedFail,
    `Returned passed=${actualPassed}, violations=${res.violations.length}. Flaw: length discrepancy pushes 1 item, and 1 <= maxUnmatched passes!`,
    { expectBug: actualPassed !== expectedFail }
  );
}

// D7-6: BUG TEST: Empty primary series vs non-empty secondary with maxUnmatchedCandles = 1
{
  const primary: Candle[] = [];
  const secondary = makeSeries(500, 60_000, 1_000_000);
  const res = validateAlignment(primary, secondary, { maxUnmatchedCandles: 1 });
  const expectedFail = false;
  const actualPassed = res.passed;
  assertTest(
    'D7-06',
    'Alignment [BUG-2]',
    'Empty primary series vs 500 secondary candles with maxUnmatchedCandles=1 (MUST FAIL CLOSED)',
    actualPassed,
    expectedFail,
    `Returned passed=${actualPassed}, violations=${res.violations.length}. Flaw: 500 candle gap is forgiven because 1 violation object <= maxUnmatched!`,
    { expectBug: actualPassed !== expectedFail }
  );
}

// D7-7: BUG TEST: toleranceMs = NaN fails to reject 10-year timestamp drift
{
  const primary = [makeCandle({ timestamp: 1_000 })];
  const secondary = [makeCandle({ timestamp: 1_000_000_000 })];
  const res = validateAlignment(primary, secondary, { toleranceMs: Number.NaN });
  const expectedFail = false;
  const actualPassed = res.passed;
  assertTest(
    'D7-07',
    'Alignment [BUG-3]',
    'toleranceMs=NaN on 10-year timestamp drift (MUST FAIL CLOSED)',
    actualPassed,
    expectedFail,
    `Returned passed=${actualPassed}, violations=${res.violations.length}. Flaw: diff > NaN evaluates to false, silently passing!`,
    { expectBug: actualPassed !== expectedFail }
  );
}

// D7-8: Unsorted secondary series breaks binary search alignment
{
  const primary = [
    makeCandle({ timestamp: 1_000 }),
    makeCandle({ timestamp: 2_000 }),
    makeCandle({ timestamp: 3_000 }),
  ];
  const secondary = [
    makeCandle({ timestamp: 3_000 }),
    makeCandle({ timestamp: 1_000 }),
    makeCandle({ timestamp: 2_000 }),
  ];
  const res = validateAlignment(primary, secondary, { toleranceMs: 0 });
  assertTest(
    'D7-08',
    'Alignment [CAVEAT]',
    'Unsorted secondary series breaks binary search alignment',
    res.passed,
    false,
    `Binary search expects sorted secondary: passed=${res.passed}, violations=${res.violations.length}`
  );
}

// D7-9: Extreme tolerances: toleranceMs = 0 (exact), 1ms, 60_000ms
{
  const primary = [makeCandle({ timestamp: 1_000_000 })];
  const secondary = [makeCandle({ timestamp: 1_000_001 })]; // 1ms drift
  const res0 = validateAlignment(primary, secondary, { toleranceMs: 0 });
  const res1 = validateAlignment(primary, secondary, { toleranceMs: 1 });
  assertTest('D7-09a', 'Alignment', '1ms drift with toleranceMs: 0 must fail', res0.passed, false, `Violations: ${res0.violations.length}`);
  assertTest('D7-09b', 'Alignment', '1ms drift with toleranceMs: 1 must pass', res1.passed, true, `Violations: ${res1.violations.length}`);
}


// ============================================================================
// SUITE 2: FUTURE-DATA CONTAMINATION (D8)
// ============================================================================
console.log('\n--- SUITE 2: FUTURE-DATA CONTAMINATION (D8) ---');

// D8-1: Clock boundary: candle.timestamp === asOf
{
  const ts = 1_700_000_000_000;
  const series = [makeCandle({ timestamp: ts })];
  const res = validateFutureData(series, { asOf: ts });
  assertTest('D8-01', 'Future Data', 'Clock boundary exact match: asOf === timestamp (must pass)', res.passed, true, `Violations: ${res.violations.length}`);
}

// D8-2: Clock boundary: asOf = candle.timestamp - 1ms
{
  const ts = 1_700_000_000_000;
  const series = [makeCandle({ timestamp: ts })];
  const res = validateFutureData(series, { asOf: ts - 1 });
  const isDelta1 = res.violations.length === 1 && res.violations[0].details.lookaheadDeltaMs === 1;
  assertTest('D8-02', 'Future Data', 'Clock boundary: asOf = timestamp - 1ms (must fail with +1ms lookahead)', res.passed === false && isDelta1, true, `Violations: ${res.violations.length}, delta: ${res.violations[0]?.details?.lookaheadDeltaMs}`);
}

// D8-3: Clock boundary: asOf = candle.timestamp + 1ms
{
  const ts = 1_700_000_000_000;
  const series = [makeCandle({ timestamp: ts })];
  const res = validateFutureData(series, { asOf: ts + 1 });
  assertTest('D8-03', 'Future Data', 'Clock boundary: asOf = timestamp + 1ms (must pass)', res.passed, true, `Violations: ${res.violations.length}`);
}

// D8-4: 10,000 candles series with last candle exactly at asOf
{
  const count = 10_000;
  const series = makeSeries(count, 60_000, 1_700_000_000_000);
  const lastTs = series[count - 1].timestamp;
  const res = validateFutureData(series, { asOf: lastTs });
  assertTest('D8-04', 'Future Data', '10,000 candles with last candle exactly at asOf (must pass)', res.passed, true, `Violations: ${res.violations.length}`);
}

// D8-5: 10,000 candles series with last candle at asOf + 1ms
{
  const count = 10_000;
  const series = makeSeries(count, 60_000, 1_700_000_000_000);
  const lastTs = series[count - 1].timestamp;
  const res = validateFutureData(series, { asOf: lastTs - 1 });
  const isExpected = res.passed === false && res.violations.length === 1 && res.violations[0].index === count - 1;
  assertTest('D8-05', 'Future Data', '10,000 candles with last candle at asOf + 1ms (must fail at terminal index)', isExpected, true, `Violations: ${res.violations.length}, index: ${res.violations[0]?.index}`);
}

// D8-6: Entire series in future (10,000 candles)
{
  const count = 10_000;
  const series = makeSeries(count, 60_000, 1_700_000_000_000);
  const asOf = 1_699_999_999_999;
  const res = validateFutureData(series, { asOf });
  const isExpected = res.passed === false && res.violations.length === count;
  assertTest('D8-06', 'Future Data', '10,000 candles entirely in future (must flag all 10,000 candles)', isExpected, true, `Violations: ${res.violations.length}`);
}

// D8-7: Config fail-closed robustness (asOf: NaN, Infinity, -Infinity, undefined)
{
  const series = [makeCandle()];
  const resNaN = validateFutureData(series, { asOf: Number.NaN });
  const resInf = validateFutureData(series, { asOf: Number.POSITIVE_INFINITY });
  const resNegInf = validateFutureData(series, { asOf: Number.NEGATIVE_INFINITY });
  const resUndef = validateFutureData(series, undefined);
  const allFailClosed = !resNaN.passed && !resInf.passed && !resNegInf.passed && !resUndef.passed;
  assertTest('D8-07', 'Future Data', 'Config fail-closed on non-finite/missing asOf', allFailClosed, true, `NaN: ${resNaN.passed}, Inf: ${resInf.passed}, Undef: ${resUndef.passed}`);
}

// D8-8: BUG TEST: Candle with timestamp NaN is silently ignored by future data check
{
  const series = [makeCandle({ timestamp: Number.NaN })];
  const res = validateFutureData(series, { asOf: 1_700_000_000_000 });
  const expectedFail = false;
  const actualPassed = res.passed;
  assertTest(
    'D8-08',
    'Future Data [BUG-4]',
    'Candle with timestamp: NaN in future data check (MUST FAIL CLOSED)',
    actualPassed,
    expectedFail,
    `Returned passed=${actualPassed}, violations=${res.violations.length}. Flaw: NaN > asOf evaluates to false, silently passing!`,
    { expectBug: actualPassed !== expectedFail }
  );
}


// ============================================================================
// SUITE 3: EXCHANGE OUTAGE PERIODS (D9)
// ============================================================================
console.log('\n--- SUITE 3: EXCHANGE OUTAGE PERIODS (D9) ---');

const barA = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
const barB = { open: 101, high: 106, low: 96, close: 103, volume: 1_100 };
const barC = { open: 102, high: 107, low: 97, close: 104, volume: 1_200 };

// D9-1: Consecutive identical bars below threshold: threshold = 5, streak = 4
{
  const series = [
    makeCandle({ timestamp: 1_000, ...barA }),
    makeCandle({ timestamp: 2_000, ...barA }),
    makeCandle({ timestamp: 3_000, ...barA }),
    makeCandle({ timestamp: 4_000, ...barA }),
    makeCandle({ timestamp: 5_000, ...barB }),
  ];
  const res = validateOutage(series, { maxConsecutiveIdenticalBars: 5 });
  assertTest('D9-01', 'Outage', 'Streak of 4 identical bars with threshold 5 (must pass)', res.passed, true, `Violations: ${res.violations.length}`);
}

// D9-2: Consecutive identical bars exactly at threshold: threshold = 5, streak = 5
{
  const series = [
    makeCandle({ timestamp: 1_000, ...barA }),
    makeCandle({ timestamp: 2_000, ...barA }),
    makeCandle({ timestamp: 3_000, ...barA }),
    makeCandle({ timestamp: 4_000, ...barA }),
    makeCandle({ timestamp: 5_000, ...barA }),
  ];
  const res = validateOutage(series, { maxConsecutiveIdenticalBars: 5 });
  const isExpected = res.passed === false && res.violations.length === 1 && res.violations[0].details.consecutiveBars === 5;
  assertTest('D9-02', 'Outage', 'Streak of 5 identical bars with threshold 5 (must fail)', isExpected, true, `Violations: ${res.violations.length}`);
}

// D9-3: Flat OHLC prices but varying volume (should NOT trigger outage)
{
  const series = [
    makeCandle({ timestamp: 1_000, open: 100, high: 100, low: 100, close: 100, volume: 10 }),
    makeCandle({ timestamp: 2_000, open: 100, high: 100, low: 100, close: 100, volume: 20 }),
    makeCandle({ timestamp: 3_000, open: 100, high: 100, low: 100, close: 100, volume: 30 }),
    makeCandle({ timestamp: 4_000, open: 100, high: 100, low: 100, close: 100, volume: 40 }),
  ];
  const res = validateOutage(series, { maxConsecutiveIdenticalBars: 3 });
  assertTest('D9-03', 'Outage', 'Flat OHLC prices with distinct volume (must pass)', res.passed, true, `Violations: ${res.violations.length}`);
}

// D9-4: Outage at start, middle, and end of 10,000-candle series
{
  const count = 10_000;
  const series = makeSeries(count, 60_000, 1_700_000_000_000);
  for (let i = 0; i < 5; i++) {
    series[i] = { ...series[i], ...barA };
  }
  for (let i = 5_000; i < 5_006; i++) {
    series[i] = { ...series[i], ...barB };
  }
  for (let i = 9_995; i < 10_000; i++) {
    series[i] = { ...series[i], ...barC };
  }

  const res = validateOutage(series, { maxConsecutiveIdenticalBars: 4 });
  const isExpected = res.passed === false && res.violations.length === 3;
  const v0 = res.violations[0]?.details;
  const v1 = res.violations[1]?.details;
  const v2 = res.violations[2]?.details;
  const indicesCorrect = v0?.startIndex === 0 && v1?.startIndex === 5_000 && v2?.startIndex === 9_995;
  assertTest('D9-04', 'Outage', '3 separate outages in 10,000 candles (start, middle, terminal)', isExpected && indicesCorrect, true, `Found ${res.violations.length} outages at indices: ${v0?.startIndex}, ${v1?.startIndex}, ${v2?.startIndex}`);
}

// D9-5: BUG TEST: maxConsecutiveIdenticalBars = NaN silently disables outage detection
{
  const series = Array.from({ length: 100 }, (_, i) =>
    makeCandle({ timestamp: 1_000 + i * 1_000, ...barA })
  );
  const res = validateOutage(series, { maxConsecutiveIdenticalBars: Number.NaN });
  const expectedFail = false;
  const actualPassed = res.passed;
  assertTest(
    'D9-05',
    'Outage [BUG-5]',
    '100 identical frozen bars with maxConsecutiveIdenticalBars=NaN (MUST FAIL CLOSED)',
    actualPassed,
    expectedFail,
    `Returned passed=${actualPassed}, violations=${res.violations.length}. Flaw: streakLength >= NaN is false, outage undetected!`,
    { expectBug: actualPassed !== expectedFail }
  );
}

// D9-6: Varying threshold sensitivity (threshold = 2, 10, 50)
{
  const series = Array.from({ length: 15 }, (_, i) =>
    makeCandle({ timestamp: 1_000 + i * 1_000, ...barA })
  );
  const res2 = validateOutage(series, { maxConsecutiveIdenticalBars: 2 });
  const res10 = validateOutage(series, { maxConsecutiveIdenticalBars: 10 });
  const res20 = validateOutage(series, { maxConsecutiveIdenticalBars: 20 });
  const correctBehavior = !res2.passed && !res10.passed && res20.passed;
  assertTest('D9-06', 'Outage', 'Varying threshold sensitivity (15 identical bars: th=2 fail, th=10 fail, th=20 pass)', correctBehavior, true, `th2: ${res2.passed}, th10: ${res10.passed}, th20: ${res20.passed}`);
}


// ============================================================================
// SUITE 4: SCALABILITY, MEMORY, & COMPLEXITY HARNESS
// ============================================================================
console.log('\n--- SUITE 4: SCALABILITY, MEMORY, & COMPLEXITY ---');

const SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
const benchmarkResults: { size: number; timeMs: number; heapDeltaMb: number }[] = [];

for (const size of SIZES) {
  const primary = makeSeries(size, 60_000, 1_700_000_000_000);
  const secondary = makeSeries(size, 60_000, 1_700_000_000_000);
  const asOf = primary[primary.length - 1].timestamp + 60_000;

  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const res = validateCandleSeries(primary, {
    asOf,
    timeframe: '1m',
    expectedIntervalMs: 60_000,
    alignment: { toleranceMs: 100 },
  }, secondary);

  const duration = performance.now() - t0;
  const memAfter = process.memoryUsage().heapUsed;
  const heapDeltaMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

  benchmarkResults.push({ size, timeMs: duration, heapDeltaMb });
  console.log(`      Size: ${size.toString().padStart(6)} candles | Time: ${duration.toFixed(2).padStart(7)}ms | Heap Delta: ${heapDeltaMb.toFixed(2).padStart(6)}MB | Valid: ${res.valid}`);
}

// Verify 10,000 candles executes under 50ms
const res10k = benchmarkResults.find((b) => b.size === 10_000);
assertTest(
  'P4-01',
  'Performance',
  '10,000 candles validation completes in < 50ms',
  res10k !== undefined && res10k.timeMs < 50,
  true,
  `Actual 10,000 candles duration: ${res10k?.timeMs.toFixed(2)}ms`
);

// Verify 100,000 candles completes in < 250ms
const res100k = benchmarkResults.find((b) => b.size === 100_000);
assertTest(
  'P4-02',
  'Performance',
  '100,000 candles validation completes in < 250ms',
  res100k !== undefined && res100k.timeMs < 250,
  true,
  `Actual 100,000 candles duration: ${res100k?.timeMs.toFixed(2)}ms`
);

// Verify linear / near-linear scaling (100k time / 10k time <= 20x for 10x size increase)
if (res10k && res100k) {
  const scalingRatio = res100k.timeMs / Math.max(1, res10k.timeMs);
  assertTest(
    'P4-03',
    'Complexity',
    `Complexity scaling ratio: 10x size increase (${scalingRatio.toFixed(2)}x time ratio <= 20x)`,
    scalingRatio <= 20,
    true,
    `10k: ${res10k.timeMs.toFixed(2)}ms, 100k: ${res100k.timeMs.toFixed(2)}ms, ratio: ${scalingRatio.toFixed(2)}x`
  );
}

// Memory Leak Harness: 50 repeated validation iterations on 10,000 candles
{
  const count = 10_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = makeSeries(count, 60_000, 1_700_000_000_000);
  const asOf = primary[primary.length - 1].timestamp + 60_000;

  const initialHeap = process.memoryUsage().heapUsed;

  for (let iter = 0; iter < 50; iter++) {
    validateCandleSeries(primary, {
      asOf,
      timeframe: '1m',
      expectedIntervalMs: 60_000,
      alignment: { toleranceMs: 100 },
    }, secondary);
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const heapGrowthMb = (finalHeap - initialHeap) / (1024 * 1024);
  console.log(`      50 iterations on 10k candles: initialHeap=${(initialHeap / 1048576).toFixed(2)}MB, finalHeap=${(finalHeap / 1048576).toFixed(2)}MB, growth=${heapGrowthMb.toFixed(2)}MB`);

  assertTest(
    'P4-04',
    'Memory Leak',
    'No runaway memory accumulation across 50 iterations on 10,000 candles (< 25MB growth)',
    heapGrowthMb < 25,
    true,
    `Heap growth after 50 runs: ${heapGrowthMb.toFixed(2)}MB`
  );
}


// ============================================================================
// SUITE 5: FAIL-CLOSED CONTRACT & EXCEPTION ROBUSTNESS
// ============================================================================
console.log('\n--- SUITE 5: FAIL-CLOSED CONTRACT & EXCEPTION ROBUSTNESS ---');

// E5-1: BUG TEST: validateIntervals throws uncaught exception on invalid timeframe
{
  let threwException = false;
  let exceptionMessage = '';
  try {
    validateIntervals(makeSeries(5), { timeframe: 'bad_cadence' });
  } catch (err: any) {
    threwException = true;
    exceptionMessage = err.message;
  }
  assertTest(
    'E5-01',
    'Exception Safety [BUG-6]',
    'validateIntervals must not throw uncaught error on invalid timeframe string (MUST RETURN FAIL-CLOSED RESULT)',
    !threwException,
    true,
    `Threw uncaught exception: "${exceptionMessage}". Violates R2 requirement of structured diagnostic return!`,
    { expectBug: threwException }
  );
}

// E5-2: BUG TEST: validateStaleness throws uncaught exception on invalid timeframe
{
  let threwException = false;
  let exceptionMessage = '';
  try {
    validateStaleness(makeSeries(5), { asOf: 1_700_000_000_000, timeframe: 'bad_cadence' });
  } catch (err: any) {
    threwException = true;
    exceptionMessage = err.message;
  }
  assertTest(
    'E5-02',
    'Exception Safety [BUG-7]',
    'validateStaleness must not throw uncaught error on invalid timeframe string (MUST RETURN FAIL-CLOSED RESULT)',
    !threwException,
    true,
    `Threw uncaught exception: "${exceptionMessage}". Violates R2 requirement of structured diagnostic return!`,
    { expectBug: threwException }
  );
}

// E5-3: BUG TEST: validateCandleSeries crashes on invalid timeframe
{
  let threwException = false;
  let exceptionMessage = '';
  try {
    validateCandleSeries(makeSeries(5), { timeframe: 'bad_cadence' });
  } catch (err: any) {
    threwException = true;
    exceptionMessage = err.message;
  }
  assertTest(
    'E5-03',
    'Exception Safety [BUG-8]',
    'validateCandleSeries must not crash when invalid timeframe is provided in config',
    !threwException,
    true,
    `Composite validator crashed: "${exceptionMessage}". System should return status DATA_INVALID, not crash!`,
    { expectBug: threwException }
  );
}


// ============================================================================
// SUITE 6: COMPOSITE VALIDATOR & CROSS-DIMENSIONAL COMBINATIONS
// ============================================================================
console.log('\n--- SUITE 6: CROSS-DIMENSION COMBINATIONS & AGGREGATION ---');

// D10-1: Clean series passes all 9 dimensions
{
  const count = 1_000;
  const primary = makeSeries(count, 60_000, 1_700_000_000_000);
  const secondary = makeSeries(count, 60_000, 1_700_000_000_000);
  const asOf = primary[count - 1].timestamp + 60_000;

  const res = validateCandleSeries(primary, {
    asOf,
    timeframe: '1m',
    expectedIntervalMs: 60_000,
    alignment: { toleranceMs: 50 },
  }, secondary);

  const allPassed = res.valid && res.status === 'VALID' && res.violations.length === 0 && res.checkResults.length === 9;
  assertTest('D10-01', 'Composite', 'Clean series passes all 9 quality dimensions with status VALID', allPassed, true, `Status: ${res.status}, checks: ${res.checkResults.length}`);
}

// D10-2: Multi-violation series fails closed with DATA_INVALID and aggregates all dimensions
{
  const series = [
    makeCandle({ timestamp: 1_000, open: 100, high: 90, low: 110, close: 100, volume: -10 }),
    makeCandle({ timestamp: 1_000 }),
    makeCandle({ timestamp: 500 }),
    makeCandle({ timestamp: 100_000 }),
  ];

  const res = validateCandleSeries(series, {
    asOf: 50_000,
    timeframe: '1m',
    expectedIntervalMs: 1_000,
  });

  const isInvalid = !res.valid && res.status === 'DATA_INVALID';
  const dimensionsViolated = new Set(res.violations.map((v) => v.dimension));
  const expectedDimensions = ['timestamp_monotonicity', 'duplicate_candles', 'impossible_ohlc', 'volume_anomalies', 'future_data'];
  const hasMultiple = expectedDimensions.every((d) => dimensionsViolated.has(d as any));

  assertTest('D10-02', 'Composite', 'Multiple simultaneous violations aggregate and produce DATA_INVALID', isInvalid && hasMultiple, true, `Dimensions caught: ${Array.from(dimensionsViolated).join(', ')}`);
}

// D10-3: Enabled dimensions filtering preserves purity
{
  const series = [makeCandle({ volume: -50 })];
  const res = validateCandleSeries(series, {
    enabledDimensions: ['timestamp_monotonicity', 'impossible_ohlc'],
  });
  assertTest('D10-03', 'Composite', 'enabledDimensions filter suppresses non-selected checks', res.valid && res.checkResults.length === 2, true, `Ran ${res.checkResults.length} checks, valid: ${res.valid}`);
}


// ============================================================================
// SUMMARY & STATISTICS
// ============================================================================
console.log('\n================================================================');
console.log('EMPIRICAL CHALLENGE SUITE SUMMARY');
console.log('================================================================');

const totalTests = records.length;
const passedTests = records.filter((r) => r.passed).length;
const failedTests = records.filter((r) => !r.passed).length;
const bugsFound = records.filter((r) => r.isBug).length;

console.log(`TOTAL CHECKS EXECUTED : ${totalTests}`);
console.log(`PASSED SPEC ASSERTIONS: ${passedTests}`);
console.log(`FAILED ASSERTIONS     : ${failedTests}`);
console.log(`CONFIRMED BUGS FOUND  : ${bugsFound}`);
console.log('================================================================\n');

if (bugsFound > 0) {
  console.log('=== CONFIRMED DEFECTS REPORT ===');
  records.filter((r) => r.isBug).forEach((b, idx) => {
    console.log(`${idx + 1}. [${b.id}] ${b.name}`);
    console.log(`   Category: ${b.category}`);
    console.log(`   Detail  : ${b.detail}\n`);
  });
}
