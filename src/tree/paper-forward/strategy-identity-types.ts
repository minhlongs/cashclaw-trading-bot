// Strategy Identity Safety Gate (§8): Pure Open-Core Schemas & Types.
// Zero @/ee, @/forest, @/land, node:fs, fetch, or live order authority imports.

import { z } from 'zod';

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const StrategyLegsSchema = z.union([z.literal(1), z.literal(2)]);
export type StrategyLegs = z.infer<typeof StrategyLegsSchema>;

export const StrategyStructureSchema = z.enum(['directional', 'market_neutral']);
export type StrategyStructure = z.infer<typeof StrategyStructureSchema>;

export const FeeSettlementModelSchema = z.enum([
  'single_leg_spot',
  'two_leg_spot_perp_maker_taker',
  'two_leg_spot_perp_taker_only',
]);
export type FeeSettlementModel = z.infer<typeof FeeSettlementModelSchema>;

export const BarGranularitySchema = z.enum(['1m', '5m', '15m', '1h', '4h', '1d']);
export type BarGranularity = z.infer<typeof BarGranularitySchema>;

export const OosProvenanceStatusSchema = z.enum([
  'UNTOUCHED_FRESH_OOS',
  'PENDING_FRESH_OOS',
  'EXPOSED_HOLDOUT_QUARANTINED',
  'UNVERIFIED',
]);
export type OosProvenanceStatus = z.infer<typeof OosProvenanceStatusSchema>;

export const StrategyProvenanceSchema = z
  .object({
    specSha256: sha256HexSchema,
    trialCount: z.number().int().min(1),
    oosStatus: OosProvenanceStatusSchema,
    paperForwardEligible: z.boolean(),
  })
  .strict();
export type StrategyProvenance = z.infer<typeof StrategyProvenanceSchema>;

export const DeclaredStrategyEconomicsSchema = z
  .object({
    strategyId: z.string().trim().min(1),
    legs: StrategyLegsSchema,
    structure: StrategyStructureSchema,
    requiresFundingAccrual: z.boolean(),
    requiresHedgeExecution: z.boolean(),
    requiresBorrowFinancing: z.boolean(),
    feeSettlementModel: FeeSettlementModelSchema,
    barGranularity: BarGranularitySchema,
    paperExecutionRequired: z.literal(true),
    provenance: StrategyProvenanceSchema,
  })
  .strict();
export type DeclaredStrategyEconomics = z.infer<typeof DeclaredStrategyEconomicsSchema>;

export const RuntimeCapabilityProfileSchema = z
  .object({
    runtimeId: z.string().trim().min(1),
    sourceModule: z.string().trim().min(1),
    supportedLegs: StrategyLegsSchema,
    structure: StrategyStructureSchema,
    supportsFundingAccrual: z.boolean(),
    supportsHedgeExecution: z.boolean(),
    supportsBorrowFinancing: z.boolean(),
    feeSettlementModel: FeeSettlementModelSchema,
    supportedBarGranularities: z.array(BarGranularitySchema).min(1).readonly(),
    paperExecutionCapable: z.boolean(),
    liveOrderAuthority: z.literal(false),
  })
  .strict();
export type RuntimeCapabilityProfile = z.infer<typeof RuntimeCapabilityProfileSchema>;

export type StrategyIdentityVerdict =
  | 'ECONOMICALLY_IDENTICAL'
  | 'ECONOMICALLY_DIFFERENT'
  | 'INSUFFICIENT_EVIDENCE';

export type StrategyIdentityDimension =
  | 'legs'
  | 'structure'
  | 'funding_accrual'
  | 'hedge_execution'
  | 'borrow_financing'
  | 'fee_settlement_model'
  | 'bar_granularity'
  | 'paper_execution'
  | 'research_provenance';

export interface StrategyIdentityMismatch {
  readonly dimension: StrategyIdentityDimension;
  readonly declared: string;
  readonly runtime: string;
  readonly severity: 'CRITICAL' | 'HIGH';
  readonly reason: string;
}

export type StrategyIdentityFailureCode =
  | 'INVALID_DECLARATION_OR_CAPABILITY'
  | 'ECONOMIC_IDENTITY_MISMATCH'
  | 'PROVENANCE_NOT_PROMOTABLE';

export type StrategyIdentityGateResult =
  | {
      readonly ok: true;
      readonly verdict: 'ECONOMICALLY_IDENTICAL';
      readonly promotionAllowed: true;
      readonly strategyId: string;
      readonly runtimeId: string;
      readonly mismatches: readonly [];
    }
  | {
      readonly ok: false;
      readonly verdict: 'ECONOMICALLY_DIFFERENT' | 'INSUFFICIENT_EVIDENCE';
      readonly promotionAllowed: false;
      readonly code: StrategyIdentityFailureCode;
      readonly mismatches: readonly StrategyIdentityMismatch[];
      readonly error: string;
    };
