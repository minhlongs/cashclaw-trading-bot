// Debate quality harness — compares deliberation arms (task §J):
//   A = single analyst, B = bull-bear debate,
//   C = debate + research manager, D = debate + CashClaw validation.
// Pure math only. Core law: multi-agent is NOT assumed better. If debate
// arms do not improve out-of-sample evidence quality or research
// efficiency over the single-analyst baseline, the verdict is REDUCE or
// DISABLE — never a silent keep.

import { z } from 'zod';
import type { DebateVerdict } from './types';

/** The four deliberation arms under comparison. */
export const DEBATE_ARMS = ['A', 'B', 'C', 'D'] as const;
export type DebateArm = (typeof DEBATE_ARMS)[number];

/** Measured performance of one arm over its evaluated hypotheses. */
export interface DebateArmMetrics {
  readonly arm: DebateArm;
  readonly sampleCount: number;
  /** Out-of-sample evidence quality, higher is better (e.g. mean OOS IC). */
  readonly oosEvidenceScore: number;
  /** Research efficiency, higher is better (e.g. surviving hypotheses per unit cost). */
  readonly researchEfficiency: number;
}

/** Comparison configuration. */
export interface DebateQualityConfig {
  /** Minimum samples per arm before a verdict is possible. */
  readonly minSamplesPerArm: number;
  /** Minimum relative improvement over arm A to count as an improvement. */
  readonly minRelativeImprovement: number;
}

/** Verdict for one debate arm relative to the baseline. */
export interface ArmVerdict {
  readonly arm: DebateArm;
  readonly verdict: DebateVerdict;
  readonly oosImprovement: number;
  readonly efficiencyImprovement: number;
}

/** Full comparison result. */
export interface DebateQualityReport {
  readonly baseline: DebateArmMetrics;
  readonly armVerdicts: readonly ArmVerdict[];
  /** Overall recommendation for the debate layer itself. */
  readonly overallVerdict: DebateVerdict;
}

/** Compare outcome: fail-closed. */
export type DebateQualityResult =
  | { readonly ok: true; readonly report: DebateQualityReport }
  | { readonly ok: false; readonly reasons: readonly string[] };

export const DEFAULT_DEBATE_QUALITY_CONFIG: DebateQualityConfig = {
  minSamplesPerArm: 20,
  minRelativeImprovement: 0.05,
};

const armMetricsSchema = z.object({
  arm: z.enum(DEBATE_ARMS),
  sampleCount: z.number().int().nonnegative(),
  oosEvidenceScore: z.number().finite(),
  researchEfficiency: z.number().finite(),
});

/** Relative improvement of candidate over baseline (baseline-zero safe). */
export function relativeImprovement(baseline: number, candidate: number): number {
  if (baseline === 0) return candidate > 0 ? 1 : 0;
  return (candidate - baseline) / Math.abs(baseline);
}

function verdictForArm(
  oosImprovement: number,
  efficiencyImprovement: number,
  minRelativeImprovement: number,
): DebateVerdict {
  const oosImproved = oosImprovement >= minRelativeImprovement;
  const efficiencyImproved = efficiencyImprovement >= minRelativeImprovement;
  if (oosImproved || efficiencyImproved) return 'PASS';
  const oosDegraded = oosImprovement <= -minRelativeImprovement;
  const efficiencyDegraded = efficiencyImprovement <= -minRelativeImprovement;
  if (oosDegraded && efficiencyDegraded) return 'DISABLE';
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
  const seen = new Set<DebateArm>();
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

/**
 * Overall verdict: PASS only if at least one debate arm passes; DISABLE if
 * every arm is disabled; REDUCE otherwise. Multi-agent is never assumed
 * better — no passing arm means the debate layer earns no keep.
 */
function computeOverallVerdict(armVerdicts: readonly ArmVerdict[]): DebateVerdict {
  if (armVerdicts.length === 0) return 'INCONCLUSIVE';
  if (armVerdicts.some((v) => v.verdict === 'PASS')) return 'PASS';
  if (armVerdicts.every((v) => v.verdict === 'DISABLE')) return 'DISABLE';
  return 'REDUCE';
}
