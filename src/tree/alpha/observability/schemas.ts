import { z } from 'zod';
import { RegimeLabel } from '../../regime/types';
import type { FeatureSnapshotHash } from './types';

export const FeatureSnapshotHashSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/, 'FeatureSnapshotHash must be a 64-character lowercase hexadecimal SHA-256 string')
  .transform((val) => val as FeatureSnapshotHash);

export const AlphaDecisionDirectionSchema = z.enum(['buy', 'sell', 'hold']);

export const AlphaDecisionRecordSchema = z
  .object({
    alphaId: z.string().trim().min(1).max(100),
    direction: AlphaDecisionDirectionSchema,
    confidence: z.number().finite().min(0).max(1),
    expectedReturn: z.number().finite(),
    expectedCost: z.number().finite().nonnegative(),
    expectedTurnover: z.number().finite().nonnegative(),
    regime: z.nativeEnum(RegimeLabel),
    horizon: z.string().trim().min(1).max(50),
    featureDependencies: z.array(z.string().trim().min(1)),
    featureSnapshotHash: FeatureSnapshotHashSchema,
    timestamp: z.number().int().positive(),
    symbol: z.string().trim().min(1).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const PortfolioDecisionRecordSchema = z
  .object({
    targetWeights: z.record(z.string().trim().min(1), z.number().finite()),
    grossExposure: z.number().finite().nonnegative(),
    netExposure: z.number().finite(),
    volTargetingScale: z.number().finite().nonnegative(),
    activeRiskOverlayAdjustments: z.array(z.string().trim().min(1)),
    timestamp: z.number().int().positive(),
    decisionId: z.string().trim().min(1).max(100).optional(),
    totalTurnover: z.number().finite().nonnegative().optional(),
    drawdownDeRisked: z.boolean().optional(),
  })
  .strict();

export const ProviderCircuitStateSchema = z.enum(['closed', 'open', 'half_open', 'degraded']);

export const ProviderProvenanceSchema = z
  .object({
    primaryProvider: z.string().trim().min(1).max(100),
    activeProvider: z.string().trim().min(1).max(100),
    usedFallback: z.boolean(),
    fallbackAttempts: z.number().int().nonnegative(),
    providerLatencyMs: z.number().finite().nonnegative().optional(),
    circuitState: ProviderCircuitStateSchema.optional(),
    errors: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const OperationalTelemetrySchema = z
  .object({
    decisionLatencyMs: z.number().finite().nonnegative(),
    dataFreshnessMs: z.number().finite().nonnegative(),
    providerProvenance: ProviderProvenanceSchema,
    timestamp: z.number().int().positive().optional(),
  })
  .strict();

export const CostStressTierSchema = z.enum(['normal', 'conservative', 'adverse', 'extreme']);

export const ShadowOrderSideSchema = z.enum(['buy', 'sell']);

export const ShadowOrderSchema = z
  .object({
    orderId: z.string().trim().min(1).max(100),
    symbol: z.string().trim().min(1).max(50),
    side: ShadowOrderSideSchema,
    size: z.number().finite().positive(),
    price: z.number().finite().positive(),
    targetWeightDelta: z.number().finite(),
    decisionTimestamp: z.number().int().positive(),
  })
  .strict();

export const ShadowFillSchema = z
  .object({
    fillId: z.string().trim().min(1).max(100),
    orderId: z.string().trim().min(1).max(100),
    symbol: z.string().trim().min(1).max(50),
    side: ShadowOrderSideSchema,
    fillPrice: z.number().finite().positive(),
    fillQuantity: z.number().finite().positive(),
    fillTimestamp: z.number().int().positive(),
    feeAmount: z.number().finite().nonnegative(),
    slippageBps: z.number().finite(),
    stressTier: CostStressTierSchema,
  })
  .strict();
