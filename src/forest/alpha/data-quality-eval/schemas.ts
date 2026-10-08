import { z } from 'zod';

export const QualityDimensionSchema = z.enum([
  'timestamp_monotonicity',
  'duplicate_candles',
  'missing_intervals',
  'stale_data',
  'impossible_ohlc',
  'volume_anomalies',
  'cross_source_alignment',
  'future_data',
  'exchange_outage',
]);

export const QualityStatusSchema = z.enum(['VALID', 'DATA_INVALID']);

export const CandleSchema = z.object({
  timestamp: z.number().int(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
}).strict();

export const QualityViolationSchema = z.object({
  dimension: QualityDimensionSchema,
  message: z.string().min(1),
  index: z.number().int().nonnegative().optional(),
  timestamp: z.number().or(z.nan()).optional(),
  details: z.record(z.string(), z.unknown()),
}).strict();

export const CheckResultSchema = z.object({
  dimension: QualityDimensionSchema,
  passed: z.boolean(),
  violations: z.array(QualityViolationSchema),
}).strict();

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  status: QualityStatusSchema,
  checkResults: z.array(CheckResultSchema),
  violations: z.array(QualityViolationSchema),
  totalCandles: z.number().int().nonnegative(),
}).strict();

export const MissingIntervalsConfigSchema = z.object({
  expectedIntervalMs: z.number().int().positive().optional(),
  timeframe: z.string().min(1).optional(),
  maxAllowedGapIntervals: z.number().int().nonnegative().optional(),
  toleranceRatio: z.number().nonnegative().optional(),
}).strict();

export const StalenessConfigSchema = z.object({
  asOf: z.number().int().nonnegative(),
  maxStalenessMs: z.number().int().nonnegative().optional(),
  timeframe: z.string().min(1).optional(),
  maxStaleIntervals: z.number().int().nonnegative().optional(),
}).strict();

export const VolumeConfigSchema = z.object({
  allowZeroVolume: z.boolean().optional(),
  flagIsolatedZeroVolume: z.boolean().optional(),
  maxConsecutiveZeroVolume: z.number().int().nonnegative().optional(),
}).strict();

export const AlignmentConfigSchema = z.object({
  toleranceMs: z.number().int().nonnegative().optional(),
  maxUnmatchedCandles: z.number().int().nonnegative().optional(),
}).strict();

export const FutureDataConfigSchema = z.object({
  asOf: z.number().int().nonnegative(),
}).strict();

export const OutageConfigSchema = z.object({
  maxConsecutiveIdenticalBars: z.number().int().positive().optional(),
}).strict();

export const DataQualityConfigSchema = z.object({
  asOf: z.number().int().nonnegative().optional(),
  timeframe: z.string().min(1).optional(),
  expectedIntervalMs: z.number().int().positive().optional(),
  missingIntervals: MissingIntervalsConfigSchema.optional(),
  staleness: StalenessConfigSchema.optional(),
  volume: VolumeConfigSchema.optional(),
  alignment: AlignmentConfigSchema.optional(),
  futureData: FutureDataConfigSchema.optional(),
  outage: OutageConfigSchema.optional(),
  enabledDimensions: z.array(QualityDimensionSchema).optional(),
}).strict();

export const DataQualityEvalConfigSchema = z.object({
  asOf: z.number().int().nonnegative().optional(),
  timeframe: z.string().min(1).optional(),
  expectedIntervalMs: z.number().int().positive().optional(),
  missingIntervals: MissingIntervalsConfigSchema.optional(),
  staleness: StalenessConfigSchema.optional(),
  volume: VolumeConfigSchema.optional(),
  alignment: AlignmentConfigSchema.optional(),
  futureData: FutureDataConfigSchema.optional(),
  outage: OutageConfigSchema.optional(),
  enabledDimensions: z.array(QualityDimensionSchema).optional(),
  reportTitle: z.string().min(1).optional(),
  generatedAt: z.number().int().nonnegative().optional(),
}).strict();

export const DataQualityEvalInputSchema = z.object({
  series: z.array(CandleSchema),
  symbol: z.string().trim().min(1),
  timeframe: z.string().trim().min(1),
  asOf: z.number().int().nonnegative().optional(),
  secondarySeries: z.array(CandleSchema).optional(),
}).strict();

export const DataQualitySummarySchema = z.object({
  totalChecks: z.number().int().nonnegative(),
  passedChecks: z.number().int().nonnegative(),
  failedChecks: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
}).strict();

export const DataQualityAssessmentReportSchema = z.object({
  status: QualityStatusSchema,
  symbol: z.string().trim().min(1),
  timeframe: z.string().trim().min(1),
  evaluatedAt: z.number().int().nonnegative(),
  validationResult: ValidationResultSchema,
  summary: DataQualitySummarySchema,
  recommendations: z.array(z.string()),
}).strict();

export const SignalGenerationResultSchema = z.object({
  status: QualityStatusSchema,
  signal: z.unknown().nullable(),
  report: DataQualityAssessmentReportSchema,
}).strict();
