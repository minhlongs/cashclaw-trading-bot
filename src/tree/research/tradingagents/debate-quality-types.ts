// Debate quality harness — Zod schemas and shared types (task §J).
// Pure types + validation only; verdict logic lives in debate-quality-compare.

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

export const armMetricsSchema = z.object({
  arm: z.enum(DEBATE_ARMS),
  sampleCount: z.number().int().nonnegative(),
  oosEvidenceScore: z.number().finite(),
  researchEfficiency: z.number().finite(),
});
