import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
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
  QualityDimensionSchema,
  QualityStatusSchema,
  QualityViolationSchema,
  SignalGenerationResultSchema,
  StalenessConfigSchema,
  ValidationResultSchema,
  VolumeConfigSchema,
} from '../schemas';

describe('Strict Zod Schemas & Adversarial Rejection', () => {
  it('parses valid candles and rejects adversarial key injection in CandleSchema', () => {
    const valid = { timestamp: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 };
    expect(CandleSchema.parse(valid)).toEqual(valid);

    const injected = { ...valid, hackerPayload: 'malicious_input' };
    expect(() => CandleSchema.parse(injected)).toThrow(ZodError);
  });

  it('rejects adversarial key injection in DataQualityEvalInputSchema', () => {
    const valid = {
      series: [{ timestamp: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 }],
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: 1_700_000_060_000,
    };
    expect(DataQualityEvalInputSchema.parse(valid)).toBeDefined();

    const injected = { ...valid, backdoor: 'drop_database' };
    expect(() => DataQualityEvalInputSchema.parse(injected)).toThrow(ZodError);
  });

  it('rejects adversarial key injection in DataQualityConfigSchema and subconfigs', () => {
    const validConfig = {
      asOf: 1_700_000_000_000,
      timeframe: '1m',
      staleness: { asOf: 1_700_000_000_000, maxStalenessMs: 120_000 },
    };
    expect(DataQualityConfigSchema.parse(validConfig)).toBeDefined();

    expect(() =>
      DataQualityConfigSchema.parse({ ...validConfig, extraKey: 'attack' }),
    ).toThrow(ZodError);

    expect(() =>
      MissingIntervalsConfigSchema.parse({ expectedIntervalMs: 60_000, unauthorized: 1 }),
    ).toThrow(ZodError);

    expect(() =>
      StalenessConfigSchema.parse({ asOf: 1_000, rogue: true }),
    ).toThrow(ZodError);

    expect(() =>
      VolumeConfigSchema.parse({ allowZeroVolume: true, invalidOpt: 'yes' }),
    ).toThrow(ZodError);

    expect(() =>
      AlignmentConfigSchema.parse({ toleranceMs: 500, unallowed: 10 }),
    ).toThrow(ZodError);

    expect(() =>
      FutureDataConfigSchema.parse({ asOf: 1_000, futureBypass: true }),
    ).toThrow(ZodError);

    expect(() =>
      OutageConfigSchema.parse({ maxConsecutiveIdenticalBars: 5, badProp: 'bar' }),
    ).toThrow(ZodError);
  });

  it('rejects adversarial key injection in DataQualityEvalConfigSchema', () => {
    const valid = { reportTitle: 'Test Report', generatedAt: 1_700_000_000_000 };
    expect(DataQualityEvalConfigSchema.parse(valid)).toBeDefined();

    const injected = { ...valid, bypassAudit: true };
    expect(() => DataQualityEvalConfigSchema.parse(injected)).toThrow(ZodError);
  });

  it('rejects adversarial key injection in QualityViolationSchema and CheckResultSchema', () => {
    const validViolation = {
      dimension: 'timestamp_monotonicity' as const,
      message: 'Non-increasing timestamp',
      index: 3,
      timestamp: 1_700_000_180_000,
      details: { actualDelta: -100 },
    };
    expect(QualityViolationSchema.parse(validViolation)).toBeDefined();

    expect(() =>
      QualityViolationSchema.parse({ ...validViolation, injectedProp: 123 }),
    ).toThrow(ZodError);

    const validCheck = {
      dimension: 'timestamp_monotonicity' as const,
      passed: false,
      violations: [validViolation],
    };
    expect(CheckResultSchema.parse(validCheck)).toBeDefined();

    expect(() =>
      CheckResultSchema.parse({ ...validCheck, injectedFlag: 'yes' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid enums for QualityDimension and QualityStatus', () => {
    expect(() => QualityDimensionSchema.parse('invalid_dimension')).toThrow(ZodError);
    expect(() => QualityStatusSchema.parse('PARTIALLY_VALID')).toThrow(ZodError);
  });

  it('rejects adversarial key injection in DataQualityAssessmentReportSchema and SignalGenerationResultSchema', () => {
    const validReport = {
      status: 'VALID' as const,
      symbol: 'BTC/USDT',
      timeframe: '1m',
      evaluatedAt: 1_700_000_000_000,
      validationResult: {
        valid: true,
        status: 'VALID' as const,
        checkResults: [],
        violations: [],
        totalCandles: 10,
      },
      summary: {
        totalChecks: 9,
        passedChecks: 9,
        failedChecks: 0,
        violationCount: 0,
      },
      recommendations: ['All good'],
    };

    expect(DataQualityAssessmentReportSchema.parse(validReport)).toBeDefined();
    expect(ValidationResultSchema.parse(validReport.validationResult)).toBeDefined();

    expect(() =>
      DataQualityAssessmentReportSchema.parse({ ...validReport, rogueField: 'inject' }),
    ).toThrow(ZodError);

    const validSignalResult = {
      status: 'VALID' as const,
      signal: { dir: 1 },
      report: validReport,
    };
    expect(SignalGenerationResultSchema.parse(validSignalResult)).toBeDefined();

    expect(() =>
      SignalGenerationResultSchema.parse({ ...validSignalResult, maliciousPayload: 99 }),
    ).toThrow(ZodError);
  });
});
