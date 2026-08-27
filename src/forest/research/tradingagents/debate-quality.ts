// Debate Quality Harness — compares deliberation arms (task §J):
//   A = single analyst, B = bull-bear debate,
//   C = debate + research manager, D = debate + CashClaw validation.
// Forest orchestration over tree-layer pure math (compareDebateArms).
// Runs all arms on identical fixtures and reports OOS-evidence delta +
// token-cost delta per arm. Binding rule: if an arm adds no measurable
// OOS evidence or research efficiency, emit REDUCE/DISABLE recommendation.
// Multi-agent is never assumed better.

import {
  compareDebateArms,
  DEFAULT_DEBATE_QUALITY_CONFIG,
  type DebateArm,
  type DebateArmMetrics,
  type DebateQualityConfig,
  type DebateQualityReport,
} from '@/tree/research/tradingagents/debate-quality';
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

/** Compare debate arms from evaluation inputs. */
export function evaluateDebateQuality(
  inputs: readonly ArmEvaluationInput[],
  config: DebateQualityConfig = DEFAULT_DEBATE_QUALITY_CONFIG,
): { ok: true; report: DebateQualityReport; computed: readonly ComputedArmMetrics[] } | { ok: false; reasons: readonly string[] } {
  const reasons: string[] = [];

  // Validate inputs
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    if (inp.oosEvidenceScores.length !== inp.researchCosts.length ||
        inp.oosEvidenceScores.length !== inp.thesisSurvival.length) {
      reasons.push(`debate quality: arm ${inp.arm} has mismatched array lengths`);
    }
  }

  const seen = new Set<DebateArm>();
  for (const inp of inputs) {
    if (seen.has(inp.arm)) reasons.push(`debate quality: duplicate arm '${inp.arm}'`);
    seen.add(inp.arm);
  }

  if (!seen.has('A')) reasons.push('debate quality: baseline arm A is required');

  if (reasons.length > 0) return { ok: false, reasons };

  // Compute metrics for each arm
  const computed = inputs.map(computeArmMetrics);

  // Convert to tree-layer DebateArmMetrics
  const armMetrics: DebateArmMetrics[] = computed.map((c) => ({
    arm: c.arm,
    sampleCount: c.sampleCount,
    oosEvidenceScore: c.oosEvidenceScore,
    researchEfficiency: c.researchEfficiency,
  }));

  // Compare using tree-layer pure function
  const result = compareDebateArms(armMetrics, config);
  if (!result.ok) {
    return { ok: false, reasons: result.reasons };
  }

  return { ok: true, report: result.report, computed };
}

/** Convenience: run all four arms on identical fixtures and compare. */
export async function runDebateQualityComparison(
  armRunner: (arm: DebateArm) => Promise<ArmEvaluationInput>,
): Promise<{ ok: true; report: DebateQualityReport; computed: readonly ComputedArmMetrics[] } | { ok: false; reasons: readonly string[] }> {
  const arms: DebateArm[] = ['A', 'B', 'C', 'D'];
  const inputs: ArmEvaluationInput[] = [];

  for (const arm of arms) {
    try {
      const input = await armRunner(arm);
      inputs.push(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reasons: [`debate quality: arm ${arm} runner failed: ${msg}`] };
    }
  }

  return evaluateDebateQuality(inputs);
}