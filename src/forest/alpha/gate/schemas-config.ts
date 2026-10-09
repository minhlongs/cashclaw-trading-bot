import { z } from 'zod';

export const PromotionGateConfigSchema = z
  .object({
    minTrades: z.number().int().min(1).default(30),
    minNetExpectancy: z.number().default(0.0),
    minProfitFactor: z.number().min(0).default(1.2),
    maxDrawdown: z.number().min(0).max(1).default(0.25),
    minSharpe: z.number().default(1.0),
    minSortino: z.number().default(1.2),
    minRegimeCoverage: z.number().min(0).max(1).default(0.50),
    maxParameterSpread: z.number().min(0).max(1).default(0.50),
    minCrossPeriodConsistency: z.number().min(0).max(1).default(0.60),
    minCrossAssetConsistency: z.number().min(0).max(1).default(0.50),
    maxSingleWindowContribution: z.number().min(0).max(1).default(0.50),
  })
  .strict();
