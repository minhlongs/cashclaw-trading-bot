// Gate G13 & G15: Paper-Forward Checkpoint, Observation & Reconciliation Contracts.

import { z } from 'zod';

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const G13TrackingArtifactSchema = z.object({
  schema_version: z.literal('1.0.0'),
  gate: z.literal('G13'),
  status: z.string().min(1),
  g13_pass: z.boolean(),
  live_trading_unlocked: z.literal(false),
  spec_path: z.string().min(1),
  spec_sha256: sha256HexSchema,
  genesis_utc: z.string().min(1),
  latest_checkpoint_utc: z.string().min(1),
  elapsed_days: z.number().int().nonnegative(),
  min_required_days: z.number().int().min(60),
  target_days: z.number().int().min(60),
  max_allowed_tracking_error_bps_per_month: z.number().positive().max(15.0),
  harness_shadow_parity_check: z.record(z.unknown()),
  day0_live_public_snapshot: z.record(z.unknown()),
  checkpoints: z.array(z.record(z.unknown())).min(1),
}).passthrough();

export type G13TrackingArtifact = z.infer<typeof G13TrackingArtifactSchema>;
export type G13Verdict = 'INCONCLUSIVE' | 'PASS' | 'FAIL';

export interface H3MakerSymbolObservation {
  readonly symbol: string;
  readonly spotMidUsd: number;
  readonly perpMidUsd: number;
  readonly impliedCarryAnnualBps: number;
  readonly fundingIntervalsBps: readonly number[];
  readonly spreadBps?: number;
  readonly bookDepthUsd?: number;
  readonly dataTimestampMs?: number;
  readonly fifoUniformDraw?: number;
  readonly fifoFillFraction?: number;
  readonly legMissUniformDraw?: number;
}

export interface PaperForwardDayInput {
  readonly dayIndex: number;
  readonly timestampMs: number;
  readonly observations: readonly H3MakerSymbolObservation[];
}

export interface PaperForwardCheckpoint {
  readonly dayIndex: number;
  readonly timestampMs: number;
  readonly paperNav: number;
  readonly grossExposure: number;
  readonly executedOrderCount: number;
  readonly ledgerBalanced: boolean;
  readonly cumulativeFundingUsd: number;
  readonly cumulativeFeesUsd: number;
  readonly checkpointSha256: string;
}

export interface OracleReplayCheckpoint {
  readonly dayIndex: number;
  readonly oracleNav: number;
}

export interface TrackingErrorReconciliationReport {
  readonly verdict: G13Verdict;
  readonly g13Pass: boolean;
  readonly liveTradingUnlocked: false;
  readonly autoKillTriggered: boolean;
  readonly elapsedDays: number;
  readonly minRequiredDays: number;
  readonly targetDays: number;
  readonly maxTrackingErrorBpsPerMonth: number;
  readonly trackingErrorBpsPerMonth: number;
  readonly maeMonthlyBps: number;
  readonly rmseMonthlyBps: number;
  readonly terminalNavDiscrepancyBps: number;
  readonly dailyReturnDiffs: readonly number[];
  readonly ledgerBreachCount: number;
  readonly protectionViolationCount: number;
  readonly reason: string;
}
