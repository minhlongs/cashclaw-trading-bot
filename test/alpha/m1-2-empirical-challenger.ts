import { validateAlignment } from '../../src/tree/alpha/data-quality/validate-alignment';
import { validateFutureData } from '../../src/tree/alpha/data-quality/validate-future-data';
import { validateOutage } from '../../src/tree/alpha/data-quality/validate-outage';
import { validateIntervals } from '../../src/tree/alpha/data-quality/validate-intervals';
import { validateStaleness } from '../../src/tree/alpha/data-quality/validate-staleness';
import { validateCandleSeries } from '../../src/tree/alpha/data-quality/validator';
import type { Candle, QualityDimension } from '../../src/tree/alpha/data-quality/types';

interface TestRecord {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  isBug: boolean;
  detail: string;
}

const records: TestRecord[] = [];

function assertTest(id: string, category: string, name: string, actualPassed: boolean, expectedPassed: boolean, detail: string, expectBug = false) {
  const isMatch = actualPassed === expectedPassed;
  const isBug = !isMatch || expectBug;
  records.push({ id, category, name, passed: isMatch, isBug, detail });
  process.stdout.write(`[${isMatch ? 'PASS' : 'FAIL'}] [${id}] ${category} :: ${name}${isBug ? ' [DEFECT]' : ''}\n`);
}

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return { timestamp: 1_700_000_000_000, open: 100, high: 105, low: 95, close: 102, volume: 1_000, ...overrides };
}

function makeSeries(count: number, intervalMs = 60_000, baseTs = 1_700_000_000_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: baseTs + i * intervalMs,
    open: 100 + (i % 7),
    high: 110 + (i % 7),
    low: 90 + (i % 7),
    close: 105 + (i % 7),
    volume: 1_000 + (i % 10) * 10,
  }));
}

const p10k = makeSeries(10_000);
const s10k = makeSeries(10_000);
assertTest('D7-01', 'Alignment', '10,000 candles exact timestamp match', validateAlignment(p10k, s10k, { toleranceMs: 0 }).passed, true, 'Exact');
assertTest('D7-02', 'Alignment', '10,000 candles jitter (+/-45ms) within toleranceMs: 50', validateAlignment(p10k, p10k.map((c, i) => ({ ...c, timestamp: c.timestamp + (i % 2 === 0 ? 45 : -45) })), { toleranceMs: 50 }).passed, true, 'Within');
assertTest('D7-03', 'Alignment', '10,000 candles jitter (+/-55ms) exceeding toleranceMs: 50', validateAlignment(p10k, p10k.map((c, i) => ({ ...c, timestamp: c.timestamp + (i % 2 === 0 ? 55 : -55) })), { toleranceMs: 50 }).passed, false, 'Exceeds');

const sDrift = makeSeries(10_000);
sDrift[7_500] = { ...sDrift[7_500], timestamp: sDrift[7_500].timestamp + 5_000 };
const resD74 = validateAlignment(p10k, sDrift, { toleranceMs: 100 });
assertTest('D7-04', 'Alignment', 'Single drift anomaly at index 7,500', !resD74.passed && resD74.violations[0]?.index === 7_500, true, 'Index 7500');
assertTest('D7-05', 'Alignment', 'Secondary has 20 extra candles when maxUnmatchedCandles=5', validateAlignment(makeSeries(5, 60_000, 1_000_000), makeSeries(25, 60_000, 1_000_000), { maxUnmatchedCandles: 5 }).passed, false, 'Extra');
assertTest('D7-06', 'Alignment', 'Empty primary vs 500 secondary candles', validateAlignment([], makeSeries(500, 60_000, 1_000_000), { maxUnmatchedCandles: 1 }).passed, false, 'Empty primary');
assertTest('D7-07', 'Alignment', 'toleranceMs=NaN on 10-year timestamp drift', validateAlignment([makeCandle({ timestamp: 1_000 })], [makeCandle({ timestamp: 1_000_000_000 })], { toleranceMs: Number.NaN }).passed, false, 'NaN tolerance');
assertTest('D7-08', 'Alignment', 'Unsorted secondary series breaks binary search alignment', validateAlignment([makeCandle({ timestamp: 1_000 }), makeCandle({ timestamp: 2_000 }), makeCandle({ timestamp: 3_000 })], [makeCandle({ timestamp: 3_000 }), makeCandle({ timestamp: 1_000 }), makeCandle({ timestamp: 2_000 })], { toleranceMs: 0 }).passed, false, 'Unsorted');
assertTest('D7-09a', 'Alignment', '1ms drift with toleranceMs: 0 must fail', validateAlignment([makeCandle({ timestamp: 1_000_000 })], [makeCandle({ timestamp: 1_000_001 })], { toleranceMs: 0 }).passed, false, 'tol=0');
assertTest('D7-09b', 'Alignment', '1ms drift with toleranceMs: 1 must pass', validateAlignment([makeCandle({ timestamp: 1_000_000 })], [makeCandle({ timestamp: 1_000_001 })], { toleranceMs: 1 }).passed, true, 'tol=1');

const ts = 1_700_000_000_000;
assertTest('D8-01', 'Future Data', 'Clock boundary exact match: asOf === timestamp', validateFutureData([makeCandle({ timestamp: ts })], { asOf: ts }).passed, true, 'Exact');
const resD82 = validateFutureData([makeCandle({ timestamp: ts })], { asOf: ts - 1 });
assertTest('D8-02', 'Future Data', 'Clock boundary: asOf = timestamp - 1ms', !resD82.passed && resD82.violations[0]?.details.lookaheadDeltaMs === 1, true, '+1ms');
assertTest('D8-03', 'Future Data', 'Clock boundary: asOf = timestamp + 1ms', validateFutureData([makeCandle({ timestamp: ts })], { asOf: ts + 1 }).passed, true, '-1ms');
const lastTs = p10k[9_999].timestamp;
assertTest('D8-04', 'Future Data', '10,000 candles with last candle at asOf', validateFutureData(p10k, { asOf: lastTs }).passed, true, 'At asOf');
const resD85 = validateFutureData(p10k, { asOf: lastTs - 1 });
assertTest('D8-05', 'Future Data', '10,000 candles with last candle at asOf + 1ms', !resD85.passed && resD85.violations[0]?.index === 9_999, true, 'Terminal');
assertTest('D8-06', 'Future Data', '10,000 candles entirely in future', validateFutureData(p10k, { asOf: 1_699_999_999_999 }).violations.length === 10_000, true, 'All 10k');
assertTest('D8-07', 'Future Data', 'Config fail-closed on non-finite/missing asOf', !validateFutureData([makeCandle()], { asOf: Number.NaN }).passed && !validateFutureData([makeCandle()], { asOf: Infinity }).passed && !validateFutureData([makeCandle()], undefined).passed, true, 'Non-finite');
assertTest('D8-08', 'Future Data', 'Candle with timestamp: NaN in future data check', validateFutureData([makeCandle({ timestamp: Number.NaN })], { asOf: ts }).passed, false, 'NaN candle');

const barA = { open: 100, high: 105, low: 95, close: 102, volume: 1_000 };
const barB = { open: 101, high: 106, low: 96, close: 103, volume: 1_100 };
assertTest('D9-01', 'Outage', 'Streak of 4 identical bars with threshold 5', validateOutage([1, 2, 3, 4].map((i) => makeCandle({ timestamp: i * 1000, ...barA })).concat(makeCandle({ timestamp: 5000, ...barB })), { maxConsecutiveIdenticalBars: 5 }).passed, true, '4 < 5');
assertTest('D9-02', 'Outage', 'Streak of 5 identical bars with threshold 5', validateOutage([1, 2, 3, 4, 5].map((i) => makeCandle({ timestamp: i * 1000, ...barA })), { maxConsecutiveIdenticalBars: 5 }).passed, false, '5 == 5');
assertTest('D9-03', 'Outage', 'Flat OHLC prices with distinct volume', validateOutage([10, 20, 30, 40].map((v, i) => makeCandle({ timestamp: (i + 1) * 1000, open: 100, high: 100, low: 100, close: 100, volume: v })), { maxConsecutiveIdenticalBars: 3 }).passed, true, 'Distinct vol');
assertTest('D9-05', 'Outage', 'maxConsecutiveIdenticalBars=NaN fails closed', validateOutage(Array.from({ length: 10 }, (_, i) => makeCandle({ timestamp: (i + 1) * 1000, ...barA })), { maxConsecutiveIdenticalBars: Number.NaN }).passed, false, 'NaN threshold');

const t0 = performance.now();
const perfRes = validateCandleSeries(p10k, { asOf: lastTs + 60_000, timeframe: '1m', expectedIntervalMs: 60_000, alignment: { toleranceMs: 100 } }, s10k);
const elapsed10k = performance.now() - t0;
assertTest('P4-01', 'Performance', '10,000 candles validation completes in < 50ms', elapsed10k < 50 && perfRes.valid, true, `${elapsed10k.toFixed(2)}ms`);

for (const [id, fn] of [
  ['E5-01', () => validateIntervals(makeSeries(5), { timeframe: 'bad_cadence' })],
  ['E5-02', () => validateStaleness(makeSeries(5), { asOf: ts, timeframe: 'bad_cadence' })],
  ['E5-03', () => validateCandleSeries(makeSeries(5), { timeframe: 'bad_cadence' })],
] as const) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assertTest(id, 'Exception Safety', `${id} handles invalid timeframe without uncaught crash`, !threw, true, `threw=${threw}`);
}

const multiRes = validateCandleSeries([
  makeCandle({ timestamp: 1_000, open: 100, high: 90, low: 110, close: 100, volume: -10 }),
  makeCandle({ timestamp: 1_000 }),
  makeCandle({ timestamp: 500 }),
  makeCandle({ timestamp: 100_000 }),
], { asOf: 50_000, timeframe: '1m', expectedIntervalMs: 1_000 });
const dims = new Set<QualityDimension>(multiRes.violations.map((v) => v.dimension));
assertTest('D10-02', 'Composite', 'Multiple simultaneous violations aggregate to DATA_INVALID', !multiRes.valid && multiRes.status === 'DATA_INVALID' && dims.has('impossible_ohlc') && dims.has('future_data'), true, `dims=${dims.size}`);
assertTest('D10-03', 'Composite', 'enabledDimensions filter suppresses non-selected checks', validateCandleSeries([makeCandle({ volume: -50 })], { enabledDimensions: ['timestamp_monotonicity', 'impossible_ohlc'] }).valid, true, 'Filtered');
