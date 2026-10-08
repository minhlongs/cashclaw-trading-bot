import {
  evaluateDataQuality,
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

const outcomes: CheckOutcome[] = [];

function record(id: string, name: string, passed: boolean, details: string): void {
  outcomes.push({ id, name, passed, details });
}

const c = (ts: number, overrides?: Partial<Candle>): Candle =>
  createBaseCandle({ timestamp: ts, ...overrides });

export function runAdversarialStressVerification(): {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly outcomes: readonly CheckOutcome[];
} {
  // VECTOR 1: Secondary series with NaN/non-finite timestamps
  {
    const primary = generateMonotonicCandles(3, 1000, 1000);
    const secondaryNaN = [c(Number.NaN), c(Number.NaN), c(Number.NaN)];
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: primary, secondarySeries: secondaryNaN, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
      () => { genCalled = true; return { buy: true }; },
      { alignment: { toleranceMs: 50 } },
    );
    const hasAlignViolation = res.report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment');
    record(
      'V1-SEC-NAN-ALL',
      'Secondary series with all-NaN timestamps blocked fail-closed',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasAlignViolation,
      `status=${res.status}, genCalled=${genCalled}, hasAlignViolation=${hasAlignViolation}`,
    );
  }

  {
    const primary = generateMonotonicCandles(3, 1000, 1000);
    const secondaryMixed = [c(1000), c(Number.NaN), c(3000)];
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: primary, secondarySeries: secondaryMixed, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
      () => { genCalled = true; return { buy: true }; },
      { alignment: { toleranceMs: 50 } },
    );
    const hasAlignViolation = res.report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment');
    record(
      'V1-SEC-NAN-MIXED',
      'Secondary series with mixed valid & NaN timestamps blocked fail-closed',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasAlignViolation,
      `status=${res.status}, genCalled=${genCalled}, hasAlignViolation=${hasAlignViolation}`,
    );
  }

  {
    const primary = generateMonotonicCandles(3, 1000, 1000);
    const secondaryInf = [c(1000), c(Number.POSITIVE_INFINITY), c(3000)];
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: primary, secondarySeries: secondaryInf, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
      () => { genCalled = true; return { buy: true }; },
      { alignment: { toleranceMs: 50 } },
    );
    const hasAlignViolation = res.report.validationResult.violations.some((v) => v.dimension === 'cross_source_alignment');
    record(
      'V1-SEC-INF',
      'Secondary series with Infinity timestamp blocked fail-closed',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasAlignViolation,
      `status=${res.status}, genCalled=${genCalled}, hasAlignViolation=${hasAlignViolation}`,
    );
  }

  // VECTOR 2: Empty candle series fail-closed behavior
  {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: [], symbol: 'BTC/USDT', timeframe: '1m' },
      () => { genCalled = true; return { action: 'BUY' }; },
    );
    const hasStaleViolation = res.report.validationResult.violations.some((v) => v.dimension === 'stale_data');
    record(
      'V2-EMPTY-NO-ASOF',
      'Empty candle series without asOf reference returns DATA_INVALID and blocks generator',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasStaleViolation,
      `status=${res.status}, genCalled=${genCalled}, hasStaleViolation=${hasStaleViolation}`,
    );
  }

  {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: [], symbol: 'ETH/USDT', timeframe: '1m', asOf: 5000 },
      () => { genCalled = true; return { action: 'BUY' }; },
    );
    const hasStaleViolation = res.report.validationResult.violations.some((v) => v.dimension === 'stale_data');
    record(
      'V2-EMPTY-WITH-ASOF',
      'Empty candle series with explicit asOf reference returns DATA_INVALID and blocks generator',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasStaleViolation,
      `status=${res.status}, genCalled=${genCalled}, hasStaleViolation=${hasStaleViolation}`,
    );
  }

  // VECTOR 3: Non-finite timestamps with Zod parsing (no uncaught ZodError)
  {
    let threw = false;
    let errMessage = '';
    try {
      const res = protectSignalGeneration(
        { series: [c(1000), c(Number.NaN)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 5000 },
        () => ({ ok: true }),
      );
      record(
        'V3-ZOD-NAN-PRIMARY',
        'Primary series with NaN timestamp handled without uncaught ZodError',
        res.status === 'DATA_INVALID' && res.signal === null,
        `status=${res.status}, signal=${JSON.stringify(res.signal)}`,
      );
    } catch (err) {
      threw = true;
      errMessage = err instanceof Error ? err.message : String(err);
      record('V3-ZOD-NAN-PRIMARY', 'Primary series with NaN timestamp threw ZodError', false, errMessage);
    }
  }

  {
    const parseRes = QualityViolationSchema.safeParse({
      dimension: 'future_data',
      message: 'Non-finite timestamp',
      timestamp: Number.NaN,
      details: {},
    });
    record(
      'V3-ZOD-SCHEMA-NAN',
      'QualityViolationSchema accepts NaN timestamp in validation violation',
      parseRes.success,
      `success=${parseRes.success}`,
    );
  }

  // VECTOR 4: Explicit maxStalenessMs: 0
  {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: [c(1000)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 1001 },
      () => { genCalled = true; return { trade: 'LONG' }; },
      { staleness: { asOf: 1001, maxStalenessMs: 0 } },
    );
    const hasStaleViolation = res.report.validationResult.violations.some((v) => v.dimension === 'stale_data');
    record(
      'V4-STALE-ZERO-FAIL',
      'Staleness check with maxStalenessMs: 0 rejects 1ms difference',
      res.status === 'DATA_INVALID' && res.signal === null && !genCalled && hasStaleViolation,
      `status=${res.status}, genCalled=${genCalled}, hasStaleViolation=${hasStaleViolation}`,
    );
  }

  {
    let genCalled = false;
    const res = protectSignalGeneration(
      { series: [c(2000)], symbol: 'BTC/USDT', timeframe: '1m', asOf: 2000 },
      () => { genCalled = true; return { trade: 'LONG' }; },
      { staleness: { asOf: 2000, maxStalenessMs: 0 } },
    );
    record(
      'V4-STALE-ZERO-PASS',
      'Staleness check with maxStalenessMs: 0 accepts exact 0ms delta',
      res.status === 'VALID' && res.signal !== null && genCalled,
      `status=${res.status}, genCalled=${genCalled}`,
    );
  }

  // VECTOR 5: Test P11 in tier3-pairwise-combinations.ts
  {
    const p11Series = [c(2000), c(1000, { open: -10, low: -15 }), c(1000)];
    const p11Res = validateCandleSeries(p11Series);
    const failedDims = new Set(p11Res.checkResults.filter((cr) => !cr.passed).map((cr) => cr.dimension));
    const expectedDims: QualityDimension[] = ['timestamp_monotonicity', 'duplicate_candles', 'impossible_ohlc'];
    const hasAllExpected = expectedDims.every((d) => failedDims.has(d));
    record(
      'V5-TIER3-P11-VALIDATE',
      'Test P11 series catches monotonicity, duplicate, and impossible OHLC simultaneously',
      !p11Res.valid && p11Res.status === 'DATA_INVALID' && hasAllExpected,
      `status=${p11Res.status}, failedDims=${Array.from(failedDims).join(',')}`,
    );
  }

  {
    const p11Series = [c(2000), c(1000, { open: -10, low: -15 }), c(1000)];
    let genCalled = false;
    const fenceRes = protectSignalGeneration(
      { series: p11Series, symbol: 'BTC/USDT', timeframe: '1m', asOf: 3000 },
      () => { genCalled = true; return { alpha: 99 }; },
    );
    record(
      'V5-TIER3-P11-FENCE',
      'Test P11 series is blocked by protectSignalGeneration signal fence',
      fenceRes.status === 'DATA_INVALID' && fenceRes.signal === null && !genCalled,
      `status=${fenceRes.status}, genCalled=${genCalled}`,
    );
  }

  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.passed).length;
  const failed = total - passed;
  return { total, passed, failed, outcomes };
}

if (require.main === module) {
  const result = runAdversarialStressVerification();
  process.stdout.write(`\n--- M3-3 Adversarial Stress Verification Results ---\n`);
  process.stdout.write(`Total:  ${result.total}\n`);
  process.stdout.write(`Passed: ${result.passed}\n`);
  process.stdout.write(`Failed: ${result.failed}\n`);
  for (const o of result.outcomes) {
    const mark = o.passed ? '✓' : '✗';
    process.stdout.write(`[${mark}] ${o.id}: ${o.name} -> ${o.details}\n`);
  }
  if (result.failed > 0) {
    process.exit(1);
  }
}
