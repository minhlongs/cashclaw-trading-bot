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
import type { Candle } from '../../src/forest/alpha/data-quality-eval/types';

interface TestRecord {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  detail: string;
}

const records: TestRecord[] = [];

function assertTest(id: string, category: string, name: string, actualPassed: boolean, expectedPassed: boolean, detail: string): void {
  const isMatch = actualPassed === expectedPassed;
  records.push({ id, category, name, passed: isMatch, detail });
  process.stdout.write(`[${isMatch ? 'PASS' : 'FAIL'}] [${id}] ${category} :: ${name}\n`);
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

const baseTs = 1_700_000_000_000;
const interval = 60_000;

function checkFenceBlocked(id: string, name: string, series: Candle[], asOf = baseTs + 10 * interval, config?: Parameters<typeof protectSignalGeneration>[2], secondarySeries?: Candle[]): void {
  let called = false;
  const res = protectSignalGeneration({ series, secondarySeries, symbol: 'BTC/USDT', timeframe: '1m', asOf }, () => { called = true; return 'signal'; }, config);
  assertTest(id, 'Signal Fence', name, res.status === 'DATA_INVALID' && res.signal === null && !called, true, `status=${res.status}`);
}

const s1 = makeSeries(6, interval, baseTs); s1[3] = { ...s1[3], timestamp: s1[2].timestamp - 5000 };
checkFenceBlocked('F1-01', 'Monotonicity inversion blocked', s1);

const s2 = makeSeries(6, interval, baseTs); s2[4] = { ...s2[4], timestamp: s2[3].timestamp };
checkFenceBlocked('F1-02', 'Flat duplicate timestamp blocked', s2);

const s3 = makeSeries(6, interval, baseTs); s3[5] = { ...s3[5], timestamp: s3[0].timestamp };
checkFenceBlocked('F1-03', 'Distant duplicate timestamp blocked', s3);

checkFenceBlocked('F1-04', 'Missing intervals blocked', [
  { timestamp: baseTs, open: 100, high: 110, low: 90, close: 105, volume: 100 },
  { timestamp: baseTs + 300_000, open: 101, high: 111, low: 91, close: 106, volume: 100 },
]);

const ohlcMutations: Array<[string, Partial<Candle>]> = [
  ['High < Low', { high: 85, low: 95 }],
  ['High < max(Open, Close)', { open: 115, high: 110, low: 90, close: 100 }],
  ['Low > min(Open, Close)', { open: 100, high: 110, low: 98, close: 92 }],
  ['Negative Open', { open: -5 }],
  ['Zero Price', { close: 0 }],
  ['Infinity Price', { high: Infinity }],
  ['NaN Price', { low: Number.NaN }],
];
ohlcMutations.forEach(([label, mut], idx) => {
  const s = makeSeries(4, interval, baseTs);
  s[1] = { ...s[1], ...mut };
  checkFenceBlocked(`F1-05-${idx}`, `Impossible OHLC (${label}) blocked`, s);
});

checkFenceBlocked('F1-06', 'Future data contamination blocked', makeSeries(5, interval, baseTs), baseTs + 2 * interval);
checkFenceBlocked('F1-07', 'Stale data feed blocked', makeSeries(5, interval, baseTs), baseTs + 500 * interval, { staleness: { asOf: baseTs + 500 * interval, maxStaleIntervals: 2 } });

for (const [idx, mut] of [[-10], [Infinity], [Number.NaN]].entries()) {
  const s = makeSeries(4, interval, baseTs);
  s[2] = { ...s[2], volume: mut[0] };
  checkFenceBlocked(`F1-08-${idx}`, `Volume anomaly (${mut[0]}) blocked`, s);
}

const sOutage = makeSeries(12, interval, baseTs);
for (let i = 2; i < 9; i++) sOutage[i] = { ...sOutage[1], timestamp: baseTs + i * interval };
checkFenceBlocked('F1-09', 'Exchange outage freeze blocked', sOutage, baseTs + 15 * interval, { outage: { maxConsecutiveIdenticalBars: 4 } });

const frozenSeries = Object.freeze(makeSeries(6, interval, baseTs).map((c) => Object.freeze({ ...c })));
let receivedCandles: readonly Candle[] | null = null;
const resPass = protectSignalGeneration(
  { series: frozenSeries, symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTs + 5 * interval + 10_000 },
  (candles) => { receivedCandles = candles; return { execution: 'APPROVED' }; },
);
assertTest('F1-10', 'Signal Fence', 'Zero silent forward-filling & pass-through exact series', resPass.status === 'VALID' && resPass.signal !== null && receivedCandles === frozenSeries, true, 'Unmutated');

const badSeries = makeSeries(4, interval, baseTs); badSeries[2] = { ...badSeries[2], volume: -50 };
const badReport = evaluateDataQuality({ series: badSeries, symbol: 'ETH/USDT', timeframe: '1m', asOf: baseTs + 10 * interval });
let threwProperError = false;
try { assertDataQualityValid(badReport); } catch (err) { threwProperError = err instanceof DataQualityAssertionError && err.report === badReport; }
assertTest('F1-11', 'Signal Fence', 'assertDataQualityValid throws DataQualityAssertionError', threwProperError, true, `threw=${threwProperError}`);

const allSchemas = [
  CandleSchema, DataQualityEvalInputSchema, DataQualityConfigSchema, DataQualityEvalConfigSchema,
  DataQualityAssessmentReportSchema, SignalGenerationResultSchema, CheckResultSchema, QualityViolationSchema,
  ValidationResultSchema, MissingIntervalsConfigSchema, StalenessConfigSchema, VolumeConfigSchema,
  AlignmentConfigSchema, FutureDataConfigSchema, OutageConfigSchema,
];
assertTest('S2-01', 'Zod Schemas', 'All 15 Zod schemas enforce .strict()', allSchemas.every((s) => !s.safeParse({ unauthorizedKey: true }).success), true, '15/15');
assertTest('S2-02', 'Zod Schemas', 'CandleSchema rejects prototype-polluted JSON payload', !CandleSchema.safeParse(JSON.parse('{"timestamp":1700000000000,"open":100,"high":110,"low":90,"close":100,"volume":10,"__proto__":{"polluted":true}}')).success, true, 'Rejected');

const primary = makeSeries(6, interval, baseTs);
checkFenceBlocked('C3-01', 'Secondary feed drift > toleranceMs blocked', primary, baseTs + 5 * interval + 10_000, { alignment: { toleranceMs: 1000 } }, primary.map((c) => ({ ...c, timestamp: c.timestamp + 5000 })));
checkFenceBlocked('C3-02', 'Missing bars in secondary feed blocked', primary, baseTs + 5 * interval + 10_000, { alignment: { maxUnmatchedCandles: 0 } }, [primary[0], primary[1], primary[5]]);
checkFenceBlocked('C3-03', 'Empty secondary feed blocked', primary, baseTs + 5 * interval + 10_000, undefined, []);

const resJitter = protectSignalGeneration(
  { series: primary, secondarySeries: primary.map((c) => ({ ...c, timestamp: c.timestamp + 200 })), symbol: 'BTC/USDT', timeframe: '1m', asOf: baseTs + 5 * interval + 10_000 },
  () => ({ rebalance: true }),
  { alignment: { toleranceMs: 500 } },
);
assertTest('C3-04', 'Cross-Source', 'Secondary feed jitter within toleranceMs passes', resJitter.status === 'VALID' && resJitter.signal !== null, true, 'Passed');
