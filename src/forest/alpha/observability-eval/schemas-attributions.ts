import { z } from 'zod';
import { RegimeLabel } from '../../../tree/regime/types';

export const AlphaEdgeAttributionSchema = z.object({
  alphaId: z.string().trim().min(1).max(100),
  decisionCount: z.number().int().nonnegative(),
  expectedNetReturnMean: z.number().finite(),
  realizedNetReturnMean: z.number().finite(),
  edgeDeltaMean: z.number().finite(),
  winRate: z.number().finite().min(0).max(1),
  sharpe: z.number().finite().nullable().optional(),
}).strict();

export const RegimeEdgeAttributionSchema = z.object({
  regime: z.nativeEnum(RegimeLabel),
  decisionCount: z.number().int().nonnegative(),
  expectedNetReturnMean: z.number().finite(),
  realizedNetReturnMean: z.number().finite(),
  edgeDeltaMean: z.number().finite(),
}).strict();

export const StressTierAttributionSchema = z.object({
  stressTier: z.string().trim().min(1).max(50),
  orderCount: z.number().int().nonnegative(),
  fillCount: z.number().int().nonnegative(),
  fillRate: z.number().finite().min(0).max(1),
  expectedSlippageBpsMean: z.number().finite(),
  realizedSlippageBpsMean: z.number().finite(),
  slippageDeltaBpsMean: z.number().finite(),
  totalFees: z.number().finite().nonnegative(),
}).strict();
