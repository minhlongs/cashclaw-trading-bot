// Gate G12 — 3-Arm Blind Net-of-Token-Cost ROI Evaluator Schemas & Types (Audit §10 & §19).
// Pure tree-layer types + Zod schemas: zero I/O, zero execution primitives, zero order surface.

import { z } from 'zod';

/** Canonical 3 blind evaluation arms over identical out-of-sample windows. */
export const NET_ROI_ARMS = [
  'DETERMINISTIC_BASELINE',
  'SINGLE_MODEL_CRITIC',
  'MULTI_AGENT_DEBATE',
] as const;

export type NetRoiArmId = (typeof NET_ROI_ARMS)[number];

/** Fail-closed deployment verdict for an AI arm relative to DETERMINISTIC_BASELINE. */
export const AI_NET_ROI_VERDICTS = [
  'KEEP_READ_ONLY_CRITIC',
  'DISABLE_NEGATIVE_NET_ROI',
] as const;

export type AiNetRoiVerdict = (typeof AI_NET_ROI_VERDICTS)[number];

/** One out-of-sample window observation for a single blind arm. */
export interface NetRoiWindowObservation {
  readonly windowId: string;
  /** Fractional gross strategy return in this window (e.g. 0.0045 = +45 bps). */
  readonly grossReturn: number;
  /** Fractional VIP-0 trading fee + slippage + funding drag in this window (non-negative). */
  readonly tradingCostDrag: number;
  /** Input prompt tokens consumed across this window (must be 0 for DETERMINISTIC_BASELINE). */
  readonly promptTokens: number;
  /** Output completion tokens consumed across this window (must be 0 for DETERMINISTIC_BASELINE). */
  readonly completionTokens: number;
  /** Count of direct/indirect order execution invocations emitted (must be 0). */
  readonly orderAuthorityCount: number;
}

/** Input trace for one arm across N aligned out-of-sample windows. */
export interface NetRoiArmInput {
  readonly arm: NetRoiArmId;
  readonly windows: readonly NetRoiWindowObservation[];
}

/** Token pricing and reference account sizing for net-of-token-cost ablation. */
export interface NetRoiEvaluationConfig {
  readonly startingCapitalUsd: number;
  readonly inputCostPer1MTokensUsd: number;
  readonly outputCostPer1MTokensUsd: number;
  readonly annualizationPeriodsPerYear: number;
  readonly minWindowsRequired: number;
}

/** Computed net-of-token-cost summary for one arm. */
export interface NetRoiArmSummary {
  readonly arm: NetRoiArmId;
  readonly windowCount: number;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalTokens: number;
  readonly totalTokenCostUsd: number;
  readonly grossReturnUsd: number;
  readonly tradingCostUsd: number;
  readonly netTradingReturnUsd: number;
  readonly netReturnAfterTokensUsd: number;
  readonly preTokenSharpe: number;
  readonly netAfterTokenSharpe: number;
  readonly orderAuthorityCount: number;
}

/** Pairwise gate verdict for SINGLE_MODEL_CRITIC and MULTI_AGENT_DEBATE vs baseline. */
export interface AiArmGateDecision {
  readonly arm: 'SINGLE_MODEL_CRITIC' | 'MULTI_AGENT_DEBATE';
  readonly verdict: AiNetRoiVerdict;
  readonly baselineSharpe: number;
  readonly netAfterTokenSharpe: number;
  readonly incrementalSharpeAfterTokens: number;
  readonly incrementalNetReturnAfterTokensUsd: number;
  readonly orderAuthorityCount: number;
  readonly rationale: string;
}

/** Full 3-arm blind net-of-token-cost evaluation report. */
export interface NetRoiAblationReport {
  readonly config: NetRoiEvaluationConfig;
  readonly armSummaries: Readonly<Record<NetRoiArmId, NetRoiArmSummary>>;
  readonly aiDecisions: Readonly<{
    SINGLE_MODEL_CRITIC: AiArmGateDecision;
    MULTI_AGENT_DEBATE: AiArmGateDecision;
  }>;
  readonly debateToSingleTokenMultiplier: number;
}

export type NetRoiAblationResult =
  | { readonly ok: true; readonly report: NetRoiAblationReport }
  | { readonly ok: false; readonly reasons: readonly string[] };

export const DEFAULT_NET_ROI_CONFIG: NetRoiEvaluationConfig = {
  startingCapitalUsd: 2_500,
  inputCostPer1MTokensUsd: 1.25,
  outputCostPer1MTokensUsd: 5.0,
  annualizationPeriodsPerYear: 365,
  minWindowsRequired: 8,
};

export const netRoiWindowSchema = z.object({
  windowId: z.string().min(1),
  grossReturn: z.number().finite(),
  tradingCostDrag: z.number().finite().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  orderAuthorityCount: z.number().int().nonnegative(),
});

export const netRoiArmInputSchema = z.object({
  arm: z.enum(NET_ROI_ARMS),
  windows: z.array(netRoiWindowSchema).min(1),
});

export const netRoiConfigSchema = z.object({
  startingCapitalUsd: z.number().finite().positive(),
  inputCostPer1MTokensUsd: z.number().finite().nonnegative(),
  outputCostPer1MTokensUsd: z.number().finite().nonnegative(),
  annualizationPeriodsPerYear: z.number().finite().positive(),
  minWindowsRequired: z.number().int().min(2),
});
