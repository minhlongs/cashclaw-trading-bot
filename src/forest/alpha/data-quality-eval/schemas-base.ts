import { z } from 'zod';

export const QualityDimensionSchema = z.enum([
  'timestamp_monotonicity', 'duplicate_candles', 'missing_intervals', 'stale_data',
  'impossible_ohlc', 'volume_anomalies', 'cross_source_alignment', 'future_data', 'exchange_outage',
]);

export const QualityStatusSchema = z.enum(['VALID', 'DATA_INVALID']);

export const CandleSchema = z.object({
  timestamp: z.number().int(), open: z.number(), high: z.number(),
  low: z.number(), close: z.number(), volume: z.number(),
}).strict();

export const QualityViolationSchema = z.object({
  dimension: QualityDimensionSchema, message: z.string().min(1),
  index: z.number().int().nonnegative().optional(), timestamp: z.number().or(z.nan()).optional(),
  details: z.record(z.string(), z.unknown()),
}).strict();

export const CheckResultSchema = z.object({
  dimension: QualityDimensionSchema, passed: z.boolean(), violations: z.array(QualityViolationSchema),
}).strict();

export const ValidationResultSchema = z.object({
  valid: z.boolean(), status: QualityStatusSchema, checkResults: z.array(CheckResultSchema),
  violations: z.array(QualityViolationSchema), totalCandles: z.number().int().nonnegative(),
}).strict();
