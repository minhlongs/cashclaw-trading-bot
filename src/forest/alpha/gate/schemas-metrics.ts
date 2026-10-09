import { z } from 'zod';
import { RegimePerformanceSchema } from './schemas-checks';

export const FinancialMetricsInputSchema = z
  .object({
    numTrades: z.number().int(),
    expectancy: z.number(),
    profitFactor: z.number(),
    maxDrawdown: z.number(),
    sharpe: z.number().nullable(),
    sortino: z.number().nullable(),
    byRegime: z.record(z.string(), z.union([RegimePerformanceSchema, z.null(), z.undefined()])),
  })
  .strict();

export const StressMetricsInputSchema = z
  .object({
    netPnlNormal: z.number(),
    netPnlConservative: z.number(),
    netPnlAdverse: z.number(),
    netPnlExtreme: z.number(),
  })
  .strict();

export const CandidateBaselineMetricsSchema = z
  .object({ sharpe: z.number(), netPnl: z.number() })
  .strict();

export const BenchmarkMetricsSchema = z
  .object({ sharpe: z.number().nullable(), netPnl: z.number() })
  .strict();
