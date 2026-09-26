/* eslint-disable no-console */
/**
 * Empirical Adversarial Challenger Suite for Milestone 2: Forest Data Quality Evaluation Seam
 * Target: src/forest/alpha/data-quality-eval/
 * Roles: critic, specialist
 * Challenger ID: challenger_m2_1
 */

import { evaluateDataQuality } from '../../src/forest/alpha/data-quality-eval/evaluate';
import {
  assertDataQualityValid,
  DataQualityAssertionError,
  protectSignalGeneration,
} from '../../src/forest/alpha/data-quality-eval/signal-fence';
import {
  AlignmentConfigSchema,
  CandleSchema,
  CheckResultSchema,
  DataQualityAssessmentReportSchema,
  DataQualityConfigSchema,
  DataQualityEvalConfigSchema,
  DataQualityEvalInputSchema,
  FutureDataConfigSchema,
  MissingIntervalsConfigSchema,
  OutageConfigSchema,
  QualityViolationSchema,
  SignalGenerationResultSchema,
  StalenessConfigSchema,
  ValidationResultSchema,
  VolumeConfigSchema,
} from '../../src/forest/alpha/data-quality-eval/schemas';
import type { Candle, DataQualityEvalInput } from '../../src/forest/alpha/data-quality-eval/types';

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
  options?: { expectBug?: boolean },
): void {
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

function makeSeries(count: number, intervalMs = 60_000, baseTs = 1_700_000_000_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: baseTs + i * intervalMs,
    open: 100 + (i % 5),
    high: 110 + (i % 5),
    low: 95 + (i % 5),
    close: 105 + (i % 5),
    volume: 1_000 + i * 15,
  }));
}

console.log('================================================================');
console.log('CHALLENGER M2-1: EMPIRICAL HARNESS FOR FOREST DATA QUALITY SEAM');
console.log('================================================================\n');

const baseTs = 1_700_000_000_000;
const interval = 60_000;

// ============================================================================
// SUITE 1: FAIL-CLOSED SIGNAL FENCE INVARIANTS (protectSignalGeneration)
// ============================================================================
console.log('--- SUITE 1: FAIL-CLOSED SIGNAL FENCE INVARIANTS ---');

// F1-01: Monotonicity Inversion
{
  const candles = makeSeries(6, interval, baseTs);
  candles[3] = { ...candles[3], timestamp: candles[2].timestamp - 5000 };
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTs + 10 * interval },
    () => { called = true; return 'signal'; },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-01', 'Signal Fence', 'Monotonicity inversion returns DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-02: Flat Non-Increasing Timestamps
{
  const candles = makeSeries(6, interval, baseTs);
  candles[4] = { ...candles[4], timestamp: candles[3].timestamp };
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'ETH/USDT', timeframe: '1m', asOf: baseTs + 10 * interval },
    () => { called = true; return 'signal'; },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-02', 'Signal Fence', 'Flat timestamp duplicate returns DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-03: Duplicate Timestamps
{
  const candles = makeSeries(6, interval, baseTs);
  candles[5] = { ...candles[5], timestamp: candles[0].timestamp };
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'SOL/USDT', timeframe: '1m', asOf: baseTs + 10 * interval },
    () => { called = true; return 'signal'; },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-03', 'Signal Fence', 'Duplicate timestamps return DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-04: Missing Interval Gap
{
  const candles = [
    { timestamp: baseTs, open: 100, high: 110, low: 90, close: 105, volume: 100 },
    { timestamp: baseTs + 300_000, open: 101, high: 111, low: 91, close: 106, volume: 100 },
  ];
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'BNB/USDT', timeframe: '1m', asOf: baseTs + 400_000 },
    () => { called = true; return 'signal'; },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-04', 'Signal Fence', 'Missing intervals return DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-05: Impossible OHLC Geometric Violations
{
  const mutations = [
    { name: 'High < Low', mut: { high: 85, low: 95 } },
    { name: 'High < max(Open, Close)', mut: { open: 115, high: 110, low: 90, close: 100 } },
    { name: 'Low > min(Open, Close)', mut: { open: 100, high: 110, low: 98, close: 92 } },
    { name: 'Negative Open', mut: { open: -5 } },
    { name: 'Zero Price', mut: { close: 0 } },
    { name: 'Infinity Price', mut: { high: Infinity } },
    { name: 'NaN Price', mut: { low: NaN } },
  ];

  for (let i = 0; i < mutations.length; i++) {
    const { name, mut } = mutations[i];
    const candles = makeSeries(4, interval, baseTs);
    candles[1] = { ...candles[1], ...mut };
    let called = false;
    const res = protectSignalGeneration(
      { series: candles, symbol: 'XRP/USDT', timeframe: '1m', asOf: baseTs + 10 * interval },
      () => { called = true; return 'signal'; },
    );
    const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
    assertTest(`F1-05${String.fromCharCode(97 + i)}`, 'Signal Fence', `Impossible OHLC (${name}) returns DATA_INVALID, signal null, generator not called`, invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
  }
}

// F1-06: Future Data Contamination
{
  const candles = makeSeries(5, interval, baseTs);
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'ADA/USDT', timeframe: '1m', asOf: baseTs + 2 * interval },
    () => { called = true; return 'signal'; },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-06', 'Signal Fence', 'Future data contamination returns DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-07: Stale Data Feed
{
  const candles = makeSeries(5, interval, baseTs);
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'AVAX/USDT', timeframe: '1m', asOf: baseTs + 500 * interval },
    () => { called = true; return 'signal'; },
    { staleness: { asOf: baseTs + 500 * interval, maxStaleIntervals: 2 } },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-07', 'Signal Fence', 'Stale data feed returns DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-08: Volume Anomalies
{
  const volMutations = [
    { name: 'Negative Volume', mut: { volume: -10 } },
    { name: 'Infinite Volume', mut: { volume: Infinity } },
    { name: 'NaN Volume', mut: { volume: NaN } },
  ];
  for (let i = 0; i < volMutations.length; i++) {
    const { name, mut } = volMutations[i];
    const candles = makeSeries(4, interval, baseTs);
    candles[2] = { ...candles[2], ...mut };
    let called = false;
    const res = protectSignalGeneration(
      { series: candles, symbol: 'DOGE/USDT', timeframe: '1m', asOf: baseTs + 10 * interval },
      () => { called = true; return 'signal'; },
    );
    const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
    assertTest(`F1-08${String.fromCharCode(97 + i)}`, 'Signal Fence', `Volume anomaly (${name}) returns DATA_INVALID, signal null, generator not called`, invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
  }
}

// F1-09: Exchange Outage Period
{
  const candles = makeSeries(12, interval, baseTs);
  for (let i = 2; i < 9; i++) {
    candles[i] = { ...candles[1], timestamp: baseTs + i * interval };
  }
  let called = false;
  const res = protectSignalGeneration(
    { series: candles, symbol: 'DOT/USDT', timeframe: '1m', asOf: baseTs + 15 * interval },
    () => { called = true; return 'signal'; },
    { outage: { maxConsecutiveIdenticalBars: 4 } },
  );
  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('F1-09', 'Signal Fence', 'Exchange outage freeze returns DATA_INVALID, signal null, generator not called', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// F1-10: Assert Zero Silent Forward-Filling / Fallback Generation
{
  const rawCandles = makeSeries(6, interval, baseTs);
  const deepCopyOriginal = JSON.parse(JSON.stringify(rawCandles));
  const frozenSeries = Object.freeze(rawCandles.map((c) => Object.freeze({ ...c })));
  let receivedCandles: readonly Candle[] | null = null;

  const res = protectSignalGeneration(
    { series: frozenSeries, symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTs + 5 * interval + 10_000 },
    (candles) => {
      receivedCandles = candles;
      return { execution: 'APPROVED' };
    },
  );

  const seriesUnmutated = JSON.stringify(frozenSeries) === JSON.stringify(deepCopyOriginal);
  const lengthMatch = res.report.validationResult.totalCandles === frozenSeries.length;
  const validStatus = res.status === 'VALID' && res.signal !== null;
  const zeroSilentFill = seriesUnmutated && lengthMatch && validStatus && receivedCandles === frozenSeries;

  assertTest('F1-10', 'Signal Fence', 'No silent forward-filling, no series modification, pass-through exact series', zeroSilentFill, true, `Unmutated: ${seriesUnmutated}, count: ${res.report.validationResult.totalCandles}`);
}

// F1-11: assertDataQualityValid Exception Contract
{
  const candles = makeSeries(4, interval, baseTs);
  candles[2] = { ...candles[2], volume: -50 };
  const report = evaluateDataQuality({
    series: candles,
    symbol: 'ETH/USDT',
    timeframe: '1m',
    asOf: baseTs + 10 * interval,
  });

  let threwProperError = false;
  try {
    assertDataQualityValid(report);
  } catch (err: unknown) {
    if (err instanceof DataQualityAssertionError) {
      threwProperError = err.name === 'DataQualityAssertionError' && err.report === report;
    }
  }

  assertTest('F1-11', 'Signal Fence', 'assertDataQualityValid throws DataQualityAssertionError on invalid report', threwProperError, true, `threwProperError: ${threwProperError}`);
}

// ============================================================================
// SUITE 2: ADVERSARIAL ZOD SCHEMA STRESS TESTING
// ============================================================================
console.log('\n--- SUITE 2: ADVERSARIAL ZOD SCHEMA STRESS TESTING ---');

// S2-01: Strict Schema Extra Key Rejection across all 15 Schemas
{
  const schemas = [
    { name: 'CandleSchema', schema: CandleSchema },
    { name: 'DataQualityEvalInputSchema', schema: DataQualityEvalInputSchema },
    { name: 'DataQualityConfigSchema', schema: DataQualityConfigSchema },
    { name: 'DataQualityEvalConfigSchema', schema: DataQualityEvalConfigSchema },
    { name: 'DataQualityAssessmentReportSchema', schema: DataQualityAssessmentReportSchema },
    { name: 'SignalGenerationResultSchema', schema: SignalGenerationResultSchema },
    { name: 'CheckResultSchema', schema: CheckResultSchema },
    { name: 'QualityViolationSchema', schema: QualityViolationSchema },
    { name: 'ValidationResultSchema', schema: ValidationResultSchema },
    { name: 'MissingIntervalsConfigSchema', schema: MissingIntervalsConfigSchema },
    { name: 'StalenessConfigSchema', schema: StalenessConfigSchema },
    { name: 'VolumeConfigSchema', schema: VolumeConfigSchema },
    { name: 'AlignmentConfigSchema', schema: AlignmentConfigSchema },
    { name: 'FutureDataConfigSchema', schema: FutureDataConfigSchema },
    { name: 'OutageConfigSchema', schema: OutageConfigSchema },
  ];

  let allStrictlyRejected = true;
  for (const { schema } of schemas) {
    const res = schema.safeParse({ unauthorizedKey: 'attack_vector', malicious: true });
    if (res.success) {
      allStrictlyRejected = false;
    }
  }

  assertTest('S2-01', 'Zod Schemas', 'All 15 Zod schemas enforce .strict() rejecting unauthorized keys', allStrictlyRejected, true, `Checked ${schemas.length} schemas`);
}

// S2-02: Prototype Pollution Defense
{
  const jsonProto = '{"timestamp":1700000000000,"open":100,"high":110,"low":90,"close":100,"volume":10,"__proto__":{"polluted":true}}';
  const parsed = JSON.parse(jsonProto);
  const parseRes = CandleSchema.safeParse(parsed);
  assertTest('S2-02', 'Zod Schemas', 'CandleSchema rejects prototype-polluted JSON payload safely', !parseRes.success, true, `safeParse success: ${parseRes.success}`);
}

// S2-03: NaN Value Rejection in Numeric Fields
{
  const validCandle = { timestamp: baseTs, open: 100, high: 110, low: 90, close: 100, volume: 10 };
  let allNaNRejected = true;
  for (const key of Object.keys(validCandle)) {
    const corrupted = { ...validCandle, [key]: NaN };
    if (CandleSchema.safeParse(corrupted).success) {
      allNaNRejected = false;
    }
  }
  const inputNaN = DataQualityEvalInputSchema.safeParse({
    series: [validCandle],
    symbol: 'BTC/USDT',
    timeframe: '1m',
    asOf: NaN,
  });
  if (inputNaN.success) {
    allNaNRejected = false;
  }

  assertTest('S2-03', 'Zod Schemas', 'Numeric schemas reject NaN values without uncaught crashes', allNaNRejected, true, `All NaN fields safely rejected: ${allNaNRejected}`);
}

// S2-04: Invalid Timeframe Format Rejection
{
  const validCandle = { timestamp: baseTs, open: 100, high: 110, low: 90, close: 100, volume: 10 };
  const invalidTFs = ['', '   ', '\t\n', 1234, null, undefined, {}, []];
  let allTFsRejected = true;
  for (const tf of invalidTFs) {
    const res = DataQualityEvalInputSchema.safeParse({
      series: [validCandle],
      symbol: 'BTC/USDT',
      timeframe: tf,
    });
    if (res.success) {
      allTFsRejected = false;
    }
  }
  assertTest('S2-04', 'Zod Schemas', 'DataQualityEvalInputSchema rejects empty, whitespace, and non-string timeframes', allTFsRejected, true, `Tested ${invalidTFs.length} invalid timeframe types`);
}

// ============================================================================
// SUITE 3: MULTI-SOURCE CROSS-ALIGNMENT IN FOREST SEAM
// ============================================================================
console.log('\n--- SUITE 3: MULTI-SOURCE CROSS-ALIGNMENT IN FOREST SEAM ---');

// C3-01: Drift Exceeding Tolerance
{
  const primary = makeSeries(6, interval, baseTs);
  const secondary = primary.map((c) => ({ ...c, timestamp: c.timestamp + 5000 }));
  let called = false;
  const res = protectSignalGeneration(
    {
      series: primary,
      secondarySeries: secondary,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTs + 5 * interval + 10_000,
    },
    () => { called = true; return 'signal'; },
    { alignment: { toleranceMs: 1000 } },
  );

  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('C3-01', 'Cross-Source', 'Secondary feed drift > toleranceMs fails-closed with DATA_INVALID', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// C3-02: Missing Intervals in Secondary Feed
{
  const primary = makeSeries(6, interval, baseTs);
  const secondary = [primary[0], primary[1], primary[5]]; // missing bars 2, 3, 4
  let called = false;
  const res = protectSignalGeneration(
    {
      series: primary,
      secondarySeries: secondary,
      symbol: 'ETH/USDT',
      timeframe: '1m',
      asOf: baseTs + 5 * interval + 10_000,
    },
    () => { called = true; return 'signal'; },
    { alignment: { maxUnmatchedCandles: 0 } },
  );

  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('C3-02', 'Cross-Source', 'Missing bars in secondary feed fail-closed with DATA_INVALID', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// C3-03: Empty Secondary Feed
{
  const primary = makeSeries(6, interval, baseTs);
  let called = false;
  const res = protectSignalGeneration(
    {
      series: primary,
      secondarySeries: [],
      symbol: 'SOL/USDT',
      timeframe: '1m',
      asOf: baseTs + 5 * interval + 10_000,
    },
    () => { called = true; return 'signal'; },
  );

  const invariantHeld = res.status === 'DATA_INVALID' && res.signal === null && !called;
  assertTest('C3-03', 'Cross-Source', 'Empty secondary feed against populated primary fails-closed with DATA_INVALID', invariantHeld, true, `status: ${res.status}, signal: ${res.signal}, called: ${called}`);
}

// C3-04: Acceptable Clock Jitter Within Tolerance
{
  const primary = makeSeries(6, interval, baseTs);
  const secondary = primary.map((c) => ({ ...c, timestamp: c.timestamp + 200 }));
  let called = false;
  const res = protectSignalGeneration(
    {
      series: primary,
      secondarySeries: secondary,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: baseTs + 5 * interval + 10_000,
    },
    () => { called = true; return { rebalance: true }; },
    { alignment: { toleranceMs: 500 } },
  );

  const passed = res.status === 'VALID' && res.signal !== null && called;
  assertTest('C3-04', 'Cross-Source', 'Secondary feed jitter within toleranceMs passes with status VALID and executes generator', passed, true, `status: ${res.status}, signal: ${JSON.stringify(res.signal)}, called: ${called}`);
}

// ============================================================================
// SUITE 4: PERFORMANCE & BENCHMARK IN FOREST SEAM
// ============================================================================
console.log('\n--- SUITE 4: PERFORMANCE & BENCHMARK IN FOREST SEAM ---');

{
  const count = 10_000;
  const primary = makeSeries(count, interval, baseTs);
  const secondary = makeSeries(count, interval, baseTs);
  const asOf = baseTs + count * interval + 10_000;

  const t0 = performance.now();
  const report = evaluateDataQuality({
    series: primary,
    secondarySeries: secondary,
    symbol: 'BTC/USDT',
    timeframe: '1m',
    asOf,
  });
  const elapsedMs = performance.now() - t0;

  assertTest('P4-01', 'Performance', '10,000 candles end-to-end seam evaluation executes in < 75ms', elapsedMs < 75, true, `Elapsed: ${elapsedMs.toFixed(2)}ms, status: ${report.status}`);
}

// ============================================================================
// SUMMARY & STATISTICS
// ============================================================================
console.log('\n================================================================');
console.log('CHALLENGER M2-1 EMPIRICAL SUITE SUMMARY');
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
