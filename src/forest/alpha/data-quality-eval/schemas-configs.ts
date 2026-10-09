import { z } from 'zod';
import { QualityDimensionSchema } from './schemas-base';

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

export const FutureDataConfigSchema = z.object({ asOf: z.number().int().nonnegative() }).strict();
export const OutageConfigSchema = z.object({ maxConsecutiveIdenticalBars: z.number().int().positive().optional() }).strict();

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
