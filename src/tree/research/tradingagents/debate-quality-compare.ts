// Debate quality harness — pure comparison math (task §J). Multi-agent is
// never assumed better: if debate arms do not improve out-of-sample evidence
// or research efficiency over the single-analyst baseline, the verdict is
// REDUCE or DISABLE — never a silent keep.

import {
  armMetricsSchema,
  DEBATE_ARMS,
  DEFAULT_DEBATE_QUALITY_CONFIG,
  type DebateArmMetrics,
  type DebateQualityConfig,
  type DebateQualityResult,
  type ArmVerdict,
} from './debate-quality-types';

/** Relative improvement of candidate over baseline (baseline-zero safe). */
export function relativeImprovement(baseline: number, candidate: number): number {
  if (baseline === 0) return candidate > 0 ? 1 : 0;
  return (candidate - baseline) / Math.abs(baseline);
}

function verdictForArm(
  oosImprovement: number,
  efficiencyImprovement: number,
  minRelativeImprovement: number,
): ArmVerdict['verdict'] {
  const oosImproved = oosImprovement >= minRelativeImprovement;
  const efficiencyImproved = efficiencyImprovement >= minRelativeImprovement;
  if (oosImproved || efficiencyImproved) return 'PASS';
  const oosDegraded = oosImprovement <= -minRelativeImprovement;
  const efficiencyDegraded = efficiencyImprovement <= -minRelativeImprovement;
  if (oosDegraded && efficiencyDegraded) return 'DISABLE';
  return 'REDUCE';
}

/**
 * Overall verdict: PASS only if at least one debate arm passes; DISABLE if
 * every arm is disabled; REDUCE otherwise. Multi-agent is never assumed
 * better — no passing arm means the debate layer earns no keep.
 */
export function computeOverallVerdict(armVerdicts: readonly ArmVerdict[]): ArmVerdict['verdict'] {
  if (armVerdicts.length === 0) return 'INCONCLUSIVE';
  if (armVerdicts.some((v) => v.verdict === 'PASS')) return 'PASS';
  if (armVerdicts.every((v) => v.verdict === 'DISABLE')) return 'DISABLE';
  return 'REDUCE';
}

/**
 * Compare debate arms against the single-analyst baseline (arm A).
 * Fail-closed: arm A must be present, every arm must meet minSamplesPerArm,
 * and duplicate arms are rejected. Collects ALL reasons.
 */
export function compareDebateArms(
  arms: readonly DebateArmMetrics[],
  config: DebateQualityConfig = DEFAULT_DEBATE_QUALITY_CONFIG,
): DebateQualityResult {
  const reasons: string[] = [];
  arms.forEach((arm, i) => {
    const parsed = armMetricsSchema.safeParse(arm);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        reasons.push(`debate quality: arms[${i}].${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
  });
  const seen = new Set<(typeof DEBATE_ARMS)[number]>();
  for (const arm of arms) {
    if (seen.has(arm.arm)) reasons.push(`debate quality: duplicate arm '${arm.arm}'`);
    seen.add(arm.arm);
  }
  const baseline = arms.find((a) => a.arm === 'A');
  if (!baseline) reasons.push('debate quality: baseline arm A is required');
  for (const arm of arms) {
    if (arm.sampleCount < config.minSamplesPerArm) {
      reasons.push(
        `debate quality: arm ${arm.arm} has ${arm.sampleCount} samples, needs >= ${config.minSamplesPerArm}`,
      );
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const base = baseline as DebateArmMetrics;
  const armVerdicts: ArmVerdict[] = [];
  for (const arm of arms) {
    if (arm.arm === 'A') continue;
    const oosImprovement = relativeImprovement(base.oosEvidenceScore, arm.oosEvidenceScore);
    const efficiencyImprovement = relativeImprovement(base.researchEfficiency, arm.researchEfficiency);
    armVerdicts.push({
      arm: arm.arm,
      verdict: verdictForArm(oosImprovement, efficiencyImprovement, config.minRelativeImprovement),
      oosImprovement,
      efficiencyImprovement,
    });
  }

  const overallVerdict = computeOverallVerdict(armVerdicts);
  return { ok: true, report: { baseline: base, armVerdicts, overallVerdict } };
}
