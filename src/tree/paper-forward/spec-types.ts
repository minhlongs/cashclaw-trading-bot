// Gate G13 & G15: Pure Open-Core SignedStrategySpec & Lifecycle Registry Schemas.
// Zero @/ee, @/forest, @/land, node:fs, fetch, or LLM order authority imports.

import { z } from 'zod';
export * from './runner-types';

export const ARCHIVED_FALSIFIED_FAMILIES = ['H1', 'H2', 'H3', 'H1_G1', 'H2_G1'] as const;
export type ArchivedFalsifiedFamily = (typeof ARCHIVED_FALSIFIED_FAMILIES)[number];

export const PAPER_FORWARD_GUARD_ERROR_CODES = [
  'STRATEGY_ARCHIVED_FALSIFIED',
  'LIVE_AUTHORITY_FORBIDDEN',
  'AI_AUTHORITY_FORBIDDEN',
  'SPEC_SIGNATURE_MISMATCH',
  'INVALID_SPEC_SCHEMA',
] as const;

export type PaperForwardGuardErrorCode = (typeof PAPER_FORWARD_GUARD_ERROR_CODES)[number];

export class PaperForwardGuardError extends Error {
  public readonly code: PaperForwardGuardErrorCode;

  public constructor(code: PaperForwardGuardErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'PaperForwardGuardError';
    this.code = code;
  }
}

const archivedSet = new Set<string>(ARCHIVED_FALSIFIED_FAMILIES);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const SignedStrategyParametersSchema = z.object({
  lookbackDays: z.number().int().positive(),
  entryAnnualBps: z.number().positive(),
  exitAnnualBps: z.number().nonnegative(),
  fifoFillProbability: z.number().min(0).max(1),
  adverseSelectionBps: z.number().nonnegative(),
  singleLegMissProbability: z.number().min(0).max(1),
  maxGrossLeverage: z.number().positive().max(1.5),
}).passthrough();

export const SignedStrategyVenueScheduleSchema = z.object({
  primaryVenue: z.string().min(1),
  benchmarkVenue: z.string().min(1),
  spotMakerBps: z.number().finite(),
  perpMakerBps: z.number().finite(),
  spotTakerBps: z.number().nonnegative(),
  perpTakerBps: z.number().nonnegative(),
}).passthrough();

export const SignedStrategyRiskGatesSchema = z.object({
  maxDrawdownSoftPct: z.number().positive(),
  maxDrawdownHardPct: z.number().positive(),
  maxDailyLossPct: z.number().positive(),
  staleDataCutoffMs: z.number().int().positive(),
  maxTrackingErrorBpsPerMonth: z.number().positive().max(15.0),
}).passthrough();

export const SignedStrategyObservationWindowSchema = z.object({
  minRequiredDays: z.number().int().min(60),
  targetDays: z.number().int().min(60),
}).passthrough();

export const SignedStrategySpecSchema = z.object({
  specVersion: z.literal('1.0.0'),
  strategyId: z.string().min(1).refine((id) => !archivedSet.has(id.trim()), {
    message: 'Archived falsified strategy family cannot be signed for G13 paper-forward',
  }),
  executionMode: z.literal('PAPER_ONLY'),
  liveOrderAuthority: z.literal(false),
  aiOrderAuthority: z.literal(false),
  universe: z.array(z.string().min(1)).min(1),
  parameters: SignedStrategyParametersSchema,
  venueSchedule: SignedStrategyVenueScheduleSchema,
  riskGates: SignedStrategyRiskGatesSchema,
  observationWindow: SignedStrategyObservationWindowSchema,
  payloadSha256: sha256HexSchema,
}).passthrough();

export type SignedStrategySpec = z.infer<typeof SignedStrategySpecSchema>;
export type UnsignedStrategySpec = Omit<SignedStrategySpec, 'payloadSha256'>;

export const StrategyLifecycleEntrySchema = z.object({
  strategy_id: z.string().min(1),
  status: z.enum(['ARCHIVED_FALSIFIED', 'PAPER_FORWARD_ELIGIBLE']),
  archive_reason: z.string().min(1).nullable(),
  g5_verdict: z.enum(['PASS', 'REJECT']),
  dsr_at_n185: z.number().finite(),
  pbo: z.number().min(0).max(1),
  locked_oos_sharpe: z.number().finite(),
  paper_forward_allowed: z.boolean(),
}).passthrough();

export const StrategyLifecycleRegistrySchema = z.object({
  schema_version: z.literal('1.0.0'),
  generated_at: z.string().min(1),
  commit: z.string().min(1),
  live_trading_locked: z.literal(true),
  strategies: z.array(StrategyLifecycleEntrySchema).min(1),
  registry_sha256: sha256HexSchema,
}).passthrough().superRefine((reg, ctx) => {
  const byId = new Map(reg.strategies.map((s) => [s.strategy_id, s]));
  for (const archivedId of ARCHIVED_FALSIFIED_FAMILIES) {
    const entry = byId.get(archivedId);
    if (!entry || entry.status !== 'ARCHIVED_FALSIFIED' || entry.paper_forward_allowed !== false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Archived strategy ${archivedId} must be ARCHIVED_FALSIFIED with paper_forward_allowed=false`,
      });
    }
  }
  for (const entry of reg.strategies) {
    if (entry.status === 'ARCHIVED_FALSIFIED' && entry.paper_forward_allowed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${entry.strategy_id} cannot allow paper_forward` });
    }
    if (entry.paper_forward_allowed && entry.strategy_id !== 'H3_MAKER') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only H3_MAKER may set paper_forward_allowed=true' });
    }
  }
});

export type StrategyLifecycleRegistry = z.infer<typeof StrategyLifecycleRegistrySchema>;
