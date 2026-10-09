import { z } from 'zod';
import { ReproducibleHashDetailsSchema } from './schemas-checks';
import { CandidateBaselineMetricsSchema, BenchmarkMetricsSchema } from './schemas-metrics';

export const RobustnessMetricsInputSchema = z
  .object({
    parameterSpread: z.number(),
    crossPeriodPositiveFraction: z.number(),
    crossAssetPositiveFraction: z.number().nullable().optional(),
    crossAssetApplicable: z.boolean().optional(),
    leakageViolations: z.number().int(),
    windowPnls: z.array(z.number()),
    baselineCandidate: CandidateBaselineMetricsSchema,
    baselineBuyHold: BenchmarkMetricsSchema,
    baselineRandomEntry: BenchmarkMetricsSchema,
    hashMatches: z.boolean(),
    hashDetails: z.union([ReproducibleHashDetailsSchema, z.string()]).optional(),
  })
  .strict();
