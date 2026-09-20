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
import {
  computeArmMetrics,
  type ArmEvaluationInput,
  type ComputedArmMetrics,
} from './debate-quality-metrics';

export {
  computeArmMetrics,
  type ArmEvaluationInput,
  type ComputedArmMetrics,
} from './debate-quality-metrics';

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
