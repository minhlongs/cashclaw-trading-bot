import { z } from 'zod';
import { RegimeLabel } from '@/tree/regime/types';
import { EXPECTED_DIRECTIONS, RESEARCH_SOURCES } from './hypothesis-contracts';

const posInt = z.number().int().positive();
const featureRefSchema = z.object({
  name: z.string().min(1),
  lookback: posInt,
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});
const universeSchema = z.object({
  id: z.string().min(1),
  symbols: z.array(z.string().min(1)).min(1),
  weighting: z.enum(['equal', 'market', 'custom']),
  rebalanceRule: z.enum(['daily', 'weekly', 'threshold', 'none']),
});
export const researchHypothesisSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  source: z.enum(RESEARCH_SOURCES),
  parentHypothesisId: z.string().min(1).nullable(),
  universe: universeSchema,
  timeframe: z.string().min(1),
  horizon: posInt,
  features: z.array(featureRefSchema).min(1),
  transformations: z.array(z.string()).default([]),
  regimeConstraints: z.array(z.nativeEnum(RegimeLabel)).default([]),
  expectedMechanism: z.string().min(1),
  expectedDirection: z.enum(EXPECTED_DIRECTIONS),
  expectedHoldingPeriod: posInt,
  costAssumption: z.enum(['normal', 'conservative', 'adverse', 'extreme']),
  generatedBy: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  experimentVersion: z.number().int().min(1),
});
