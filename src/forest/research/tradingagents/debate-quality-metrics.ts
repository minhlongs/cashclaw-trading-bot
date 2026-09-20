// Debate Quality Metrics — arm evaluation input, computed metrics,
// and the mathematical metric extractor for debate quality comparison.

import type { DebateArm } from '@/tree/research/tradingagents/debate-quality';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';

/** Arm evaluation input: fixture + provider + optional injected outcomes. */
export interface ArmEvaluationInput {
  readonly arm: DebateArm;
  readonly researchGoalId: string;
  readonly proposalId: string;
  /** Injected OOS evidence scores (e.g., mean IC from backtest) for each evaluated hypothesis. */
  readonly oosEvidenceScores: readonly number[];
  /** Injected research costs (e.g., token count, wall time) per hypothesis. */
  readonly researchCosts: readonly number[];
  /** Injected thesis survival flags per hypothesis (true if thesis survived OOS). */
  readonly thesisSurvival: readonly boolean[];
  /** Model provenance for each call in this arm. */
  readonly modelProvenance: readonly ModelProvenanceRecord[];
}

/** Computed arm metrics. */
export interface ComputedArmMetrics {
  readonly arm: DebateArm;
  readonly sampleCount: number;
  readonly oosEvidenceScore: number;
  readonly researchEfficiency: number;
  readonly totalTokens: number;
  readonly totalLatencyMs: number;
}

/** Compute DebateArmMetrics from injected evaluation data. */
export function computeArmMetrics(input: ArmEvaluationInput): ComputedArmMetrics {
  const { oosEvidenceScores, researchCosts, thesisSurvival, modelProvenance } = input;
  const sampleCount = oosEvidenceScores.length;

  // OOS evidence score = mean OOS evidence score
  const oosEvidenceScore = sampleCount > 0
    ? oosEvidenceScores.reduce((s, v) => s + v, 0) / sampleCount
    : 0;

  // Research efficiency = surviving hypotheses / total cost (token proxy)
  const totalCost = researchCosts.reduce((s, v) => s + v, 0);
  const survived = thesisSurvival.filter(Boolean).length;
  const researchEfficiency = totalCost > 0 ? survived / totalCost : 0;

  // Provenance totals
  const totalTokens = modelProvenance.reduce(
    (s, p) => s + (p.provenance.promptTokens ?? 0) + (p.provenance.completionTokens ?? 0),
    0,
  );
  const totalLatencyMs = modelProvenance.reduce(
    (s, p) => s + (p.provenance.latencyMs ?? 0),
    0,
  );

  return {
    arm: input.arm,
    sampleCount,
    oosEvidenceScore,
    researchEfficiency,
    totalTokens,
    totalLatencyMs,
  };
}
