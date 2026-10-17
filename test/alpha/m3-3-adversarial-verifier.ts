import {
  protectSignalGeneration,
  QualityViolationSchema,
} from '@/forest/alpha/data-quality-eval';
import {
  type Candle,
  type QualityDimension,
  validateCandleSeries,
} from '@/tree/alpha/data-quality';
import { createBaseCandle, generateMonotonicCandles } from './data-quality-fixtures';

interface CheckOutcome {
  readonly id: string;
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

export function runAdversarialStressVerification(): {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly outcomes: readonly CheckOutcome[];
} {
  const outcomes: CheckOutcome[] = [];
  const record = (id: string, name: string, passed: boolean, details: string): void => {
    outcomes.push({ id, name, passed, details });
  };

  const primary = generateMonotonicCandles(3, 1000, 1000);
  const v1Cases: Array<[string, string, Candle[]]> = [
    ['V1-SEC-NAN-ALL', 'Secondary series with all-NaN timestamps blocked fail-closed', [c(Number.NaN), c(Number.NaN), c(Number.NaN)]],
    ['V1-SEC-NAN-MIXED', 'Secondary series with mixed valid & NaN timestamps blocked fail-closed', [c(1000), c(Number.NaN), c(3000)]],
    ['V1-SEC-INF', 'Secondary series with Infinity timestamp blocked fail-closed', [c(1000), c(Number.POSITIVE_INFINITY), c(3000)]],
  ];
  for (const [id, name, secondarySeries] of v1Cases) {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: primary, secondarySeries, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
      () => { genCalled = true; return { buy: true }; },
      { alignment: { toleranceMs: 50 } },
    );
    const hasAlignViolation = res.report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment');
    record(id, name, res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasAlignViolation, `status=${res.status}`);
  }

  for (const [id, name, asOf] of [
    ['V2-EMPTY-NO-ASOF', 'Empty candle series without asOf reference returns DATA_INVALID', undefined],
    ['V2-EMPTY-WITH-ASOF', 'Empty candle series with explicit asOf reference returns DATA_INVALID', 5000],
  ] as const) {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: [], symbol: 'BTC/USDT', timeframe: '1m', asOf },
      () => { genCalled = true; return { action: 'BUY' }; },
    );
    const hasStaleViolation = res.report.validationResult.violations.some((v) => v.dimension === 'stale_data');
    record(id, name, res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasStaleViolation, `status=${res.status}`);
  }

  try {
    const res = protectSignalGeneration(
      { series: [c(1000), c(Number.NaN)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 5000 },
      () => ({ ok: true }),
    );
    record('V3-ZOD-NAN-PRIMARY', 'Primary series with NaN timestamp handled without uncaught ZodError', res.status === 'DATA_INVALID' && res.signal === null, `status=${res.status}`);
  } catch (err) {
    record('V3-ZOD-NAN-PRIMARY', 'Primary series with NaN timestamp threw ZodError', false, String(err));
  }

  const parseRes = QualityViolationSchema.safeParse({
    dimension: 'future_data',
    message: 'Non-finite timestamp',
    timestamp: Number.NaN,
    details: {},
  });
  record('V3-ZOD-SCHEMA-NAN', 'QualityViolationSchema accepts NaN timestamp in validation violation', parseRes.success, `success=${parseRes.success}`);

  let genCalledFail = false;
  const resFail = protectSignalGeneration(
    { series: [c(1000)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 1001 },
    () => { genCalledFail = true; return { trade: 'LONG' }; },
    { staleness: { asOf: 1001, maxStalenessMs: 0 } },
  );
  const hasStale = resFail.report.validationResult.violations.some((v) => v.dimension === 'stale_data');
  record('V4-STALE-ZERO-FAIL', 'Staleness check with maxStalenessMs: 0 rejects 1ms difference', resFail.status === 'DATA_INVALID' && resFail.signal === null && !genCalledFail && hasStale, `status=${resFail.status}`);

  let genCalledPass = false;
  const resPass = protectSignalGeneration(
    { series: [c(2000)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 2000 },
    () => { genCalledPass = true; return { trade: 'LONG' }; },
    { staleness: { asOf: 2000, maxStalenessMs: 0 } },
  );
  record('V4-STALE-ZERO-PASS', 'Staleness check with maxStalenessMs: 0 accepts exact 0ms delta', resPass.status === 'VALID' && resPass.signal !== null && genCalledPass, `status=${resPass.status}`);

  const p11Series = [c(2000), c(1000, { open: -10, low: -15 }), c(1000)];
  const p11Res = validateCandleSeries(p11Series);
  const failedDims = new Set(p11Res.checkResults.filter((cr) => !cr.passed).map((cr) => cr.dimension));
  const expectedDims: QualityDimension[] = ['timestamp_monotonicity', 'duplicate_candles', 'impossible_ohlc'];
  record('V5-TIER3-P11-VALIDATE', 'Test P11 series catches monotonicity, duplicate, and impossible OHLC simultaneously', !p11Res.valid && p11Res.status === 'DATA_INVALID' && expectedDims.every((d) => failedDims.has(d)), `status=${p11Res.status}`);

  let genCalledP11 = false;
  const fenceRes = protectSignalGeneration(
    { series: p11Series, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
    () => { genCalledP11 = true; return { alpha: 99 }; },
  );
  record('V5-TIER3-P11-FENCE', 'Test P11 series is blocked by protectSignalGeneration signal fence', fenceRes.status === 'DATA_INVALID' && fenceRes.signal === null && !genCalledP11, `status=${fenceRes.status}`);

  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.passed).length;
  return { total, passed, failed: total - passed, outcomes };
}

if (require.main === module) {
  const result = runAdversarialStressVerification();
  process.stdout.write(`Total: ${result.total}, Passed: ${result.passed}, Failed: ${result.failed}\n`);
  if (result.failed > 0) process.exit(1);
}
