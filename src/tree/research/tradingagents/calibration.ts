// AgentCalibrationScore — per-agent/model/provider calibration metrics
// (task §H). Pure math only: no I/O, no clock. Fail-closed: building a
// score from empty or invalid outcomes is rejected, never padded with
// defaults. Metrics: directional accuracy, thesis survival, calibration
// error (ECE), Brier score, expected-vs-realized return/volatility,
// false-positive/false-negative rate, regime-specific accuracy.

import { z } from 'zod';
import { RegimeLabel } from '@/tree/regime/types';
import type { AgentRole } from './types';

/** One resolved prediction used for calibration scoring. */
export interface CalibrationOutcome {
  readonly predictedDirection: 'long' | 'short' | 'neutral';
  /** Confidence in the predicted direction, 0..1. */
  readonly predictedConfidence: number;
  readonly predictedReturn: number;
  readonly predictedVolatility: number;
  readonly realizedReturn: number;
  readonly realizedVolatility: number;
  /** Whether the underlying thesis survived contact with reality. */
  readonly thesisSurvived: boolean;
  readonly regime: RegimeLabel;
}

/** Identity of the scored agent (role + provider + model). */
export interface CalibrationAgentKey {
  readonly agentRole: AgentRole;
  readonly providerId: string;
  readonly modelId: string;
}

/** Per-regime accuracy bucket. */
export interface RegimeAccuracy {
  readonly count: number;
  readonly accuracy: number;
}

/** Full calibration score for one agent (task §H). */
export interface AgentCalibrationScore {
  readonly agent: CalibrationAgentKey;
  readonly sampleCount: number;
  readonly directionalAccuracy: number;
  readonly thesisSurvivalRate: number;
  readonly brierScore: number;
  readonly calibrationError: number;
  readonly expectedVsRealized: {
    readonly returnMae: number;
    readonly volatilityMae: number;
  };
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly regimeAccuracy: Readonly<Record<string, RegimeAccuracy>>;
}

/** Build outcome: fail-closed. */
export type CalibrationResult =
  | { readonly ok: true; readonly score: AgentCalibrationScore }
  | { readonly ok: false; readonly reasons: readonly string[] };

const regimeValues = Object.values(RegimeLabel) as [string, ...string[]];

const calibrationOutcomeSchema = z.object({
  predictedDirection: z.enum(['long', 'short', 'neutral']),
  predictedConfidence: z.number().min(0).max(1),
  predictedReturn: z.number().finite(),
  predictedVolatility: z.number().finite().nonnegative(),
  realizedReturn: z.number().finite(),
  realizedVolatility: z.number().finite().nonnegative(),
  thesisSurvived: z.boolean(),
  regime: z.enum(regimeValues),
});

const ECE_BINS = 10;

/** Whether the predicted direction matched the realized move. */
export function isDirectionCorrect(o: CalibrationOutcome): boolean {
  if (o.predictedDirection === 'long') return o.realizedReturn > 0;
  if (o.predictedDirection === 'short') return o.realizedReturn < 0;
  return o.realizedReturn === 0;
}

/** Brier score: mean squared error between confidence and correctness. */
export function computeBrierScore(outcomes: readonly CalibrationOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const sum = outcomes.reduce(
    (acc, o) => acc + (o.predictedConfidence - (isDirectionCorrect(o) ? 1 : 0)) ** 2,
    0,
  );
  return sum / outcomes.length;
}

/** Expected calibration error (ECE) over equal-width confidence bins. */
export function computeCalibrationError(outcomes: readonly CalibrationOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const bins: { confSum: number; correct: number; count: number }[] = Array.from(
    { length: ECE_BINS },
    () => ({ confSum: 0, correct: 0, count: 0 }),
  );
  for (const o of outcomes) {
    const idx = Math.min(ECE_BINS - 1, Math.floor(o.predictedConfidence * ECE_BINS));
    bins[idx].confSum += o.predictedConfidence;
    bins[idx].correct += isDirectionCorrect(o) ? 1 : 0;
    bins[idx].count += 1;
  }
  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    const avgConf = bin.confSum / bin.count;
    const accuracy = bin.correct / bin.count;
    ece += (bin.count / outcomes.length) * Math.abs(avgConf - accuracy);
  }
  return ece;
}

/**
 * Build an AgentCalibrationScore. Fail-closed: rejects empty outcome lists
 * and any outcome failing validation; collects ALL reasons.
 */
export function buildAgentCalibrationScore(
  agent: CalibrationAgentKey,
  outcomes: readonly CalibrationOutcome[],
): CalibrationResult {
  const reasons: string[] = [];
  if (agent.agentRole.trim() === '') reasons.push('calibration: agentRole must be non-empty');
  if (agent.providerId.trim() === '') reasons.push('calibration: providerId must be non-empty');
  if (agent.modelId.trim() === '') reasons.push('calibration: modelId must be non-empty');
  if (outcomes.length === 0) reasons.push('calibration: at least one outcome is required');
  outcomes.forEach((o, i) => {
    const parsed = calibrationOutcomeSchema.safeParse(o);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        reasons.push(`calibration: outcomes[${i}].${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
  });
  if (reasons.length > 0) return { ok: false, reasons };

  const n = outcomes.length;
  const correctCount = outcomes.filter(isDirectionCorrect).length;
  const survivedCount = outcomes.filter((o) => o.thesisSurvived).length;
  const directional = outcomes.filter((o) => o.predictedDirection !== 'neutral');
  const neutral = outcomes.filter((o) => o.predictedDirection === 'neutral');
  const falsePositives = directional.filter((o) => !isDirectionCorrect(o)).length;
  const falseNegatives = neutral.filter((o) => o.realizedReturn !== 0).length;

  const regimeAccuracy: Record<string, RegimeAccuracy> = {};
  for (const regime of Object.values(RegimeLabel)) {
    const inRegime = outcomes.filter((o) => o.regime === regime);
    if (inRegime.length === 0) continue;
    regimeAccuracy[regime] = {
      count: inRegime.length,
      accuracy: inRegime.filter(isDirectionCorrect).length / inRegime.length,
    };
  }

  const returnMae =
    outcomes.reduce((acc, o) => acc + Math.abs(o.predictedReturn - o.realizedReturn), 0) / n;
  const volatilityMae =
    outcomes.reduce((acc, o) => acc + Math.abs(o.predictedVolatility - o.realizedVolatility), 0) / n;

  return {
    ok: true,
    score: {
      agent,
      sampleCount: n,
      directionalAccuracy: correctCount / n,
      thesisSurvivalRate: survivedCount / n,
      brierScore: computeBrierScore(outcomes),
      calibrationError: computeCalibrationError(outcomes),
      expectedVsRealized: { returnMae, volatilityMae },
      falsePositiveRate: directional.length === 0 ? 0 : falsePositives / directional.length,
      falseNegativeRate: neutral.length === 0 ? 0 : falseNegatives / neutral.length,
      regimeAccuracy,
    },
  };
}
