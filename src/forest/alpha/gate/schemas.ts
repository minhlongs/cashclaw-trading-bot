import { z } from 'zod';
import { GateCheckSchema } from './schemas-checks';
import { FinancialMetricsInputSchema, StressMetricsInputSchema } from './schemas-metrics';
import { RobustnessMetricsInputSchema } from './schemas-robustness';

export * from './schemas-checks';
export * from './schemas-config';
export * from './schemas-metrics';
export * from './schemas-robustness';

export const PromotionGateInputSchema = z
  .object({
    financial: FinancialMetricsInputSchema,
    stress: StressMetricsInputSchema,
    robustness: RobustnessMetricsInputSchema,
  })
  .strict();

export const PromotionGateResultSchema = z
  .object({
    passed: z.boolean(),
    verdict: z.enum(['PASSED', 'KILLED']),
    checks: z.array(GateCheckSchema),
    failedChecks: z.array(GateCheckSchema),
    diagnosticReasons: z.array(z.string()),
    timestamp: z.number(),
  })
  .strict();
