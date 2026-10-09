import { z } from 'zod';
import { QualityStatusSchema, CandleSchema, ValidationResultSchema } from './schemas-base';

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
