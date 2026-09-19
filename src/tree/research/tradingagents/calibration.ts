// AgentCalibrationScore — per-agent/model/provider calibration metrics
// (task §H). Pure math only: no I/O, no clock. Fail-closed: building a
// score from empty or invalid outcomes is rejected, never padded with
// defaults. Metrics: directional accuracy, thesis survival, calibration
// error (ECE), Brier score, expected-vs-realized return/volatility,
// false-positive/false-negative rate, regime-specific accuracy.

import { RegimeLabel } from '@/tree/regime/types';
import {
  calibrationOutcomeSchema,
  type CalibrationAgentKey,
  type CalibrationOutcome,
  type CalibrationResult,
  type RegimeAccuracy,
} from './calibration-types';
import {
  isDirectionCorrect,
  computeBrierScore,
  computeCalibrationError,
} from './calibration-metrics';

// Re-export types for backward compatibility
export type {
  CalibrationOutcome,
  CalibrationAgentKey,
  RegimeAccuracy,
  AgentCalibrationScore,
  CalibrationResult,
} from './calibration-types';
export { ECE_BINS, calibrationOutcomeSchema } from './calibration-types';
export { isDirectionCorrect, computeBrierScore, computeCalibrationError } from './calibration-metrics';

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
