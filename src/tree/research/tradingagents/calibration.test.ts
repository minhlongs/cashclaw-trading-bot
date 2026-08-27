// AgentCalibrationScore tests — pure calibration math (task §H):
// directional accuracy, thesis survival, Brier score, ECE, expected vs
// realized return/volatility, FP/FN rates, regime-specific accuracy.

import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import {
  buildAgentCalibrationScore,
  computeBrierScore,
  computeCalibrationError,
  isDirectionCorrect,
  type CalibrationAgentKey,
  type CalibrationOutcome,
} from './calibration';

const AGENT: CalibrationAgentKey = {
  agentRole: 'analyst',
  providerId: 'Anthropic',
  modelId: 'claude-x',
};

function makeOutcome(overrides: Partial<CalibrationOutcome> = {}): CalibrationOutcome {
  return {
    predictedDirection: 'long',
    predictedConfidence: 0.7,
    predictedReturn: 0.02,
    predictedVolatility: 0.1,
    realizedReturn: 0.03,
    realizedVolatility: 0.12,
    thesisSurvived: true,
    regime: RegimeLabel.TREND_UP,
    ...overrides,
  };
}

describe('isDirectionCorrect', () => {
  it('long is correct when realized return is positive', () => {
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'long', realizedReturn: 0.01 }))).toBe(true);
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'long', realizedReturn: -0.01 }))).toBe(false);
  });

  it('short is correct when realized return is negative', () => {
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'short', realizedReturn: -0.01 }))).toBe(true);
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'short', realizedReturn: 0.01 }))).toBe(false);
  });

  it('neutral is correct only when realized return is zero', () => {
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'neutral', realizedReturn: 0 }))).toBe(true);
    expect(isDirectionCorrect(makeOutcome({ predictedDirection: 'neutral', realizedReturn: 0.01 }))).toBe(false);
  });
});

describe('computeBrierScore', () => {
  it('is 0 for perfectly confident correct predictions', () => {
    const outcomes = [makeOutcome({ predictedConfidence: 1, realizedReturn: 0.05 })];
    expect(computeBrierScore(outcomes)).toBe(0);
  });

  it('is 1 for perfectly confident wrong predictions', () => {
    const outcomes = [makeOutcome({ predictedConfidence: 1, realizedReturn: -0.05 })];
    expect(computeBrierScore(outcomes)).toBe(1);
  });

  it('is 0.25 for 0.5-confidence predictions', () => {
    const outcomes = [makeOutcome({ predictedConfidence: 0.5, realizedReturn: 0.05 })];
    expect(computeBrierScore(outcomes)).toBeCloseTo(0.25);
  });

  it('returns 0 for empty outcomes', () => {
    expect(computeBrierScore([])).toBe(0);
  });
});

describe('computeCalibrationError', () => {
  it('is 0 for perfectly calibrated predictions', () => {
    // confidence 0.95, all correct → avgConf 0.95, accuracy 1 → ECE = 0.05
    const outcomes = Array.from({ length: 10 }, () =>
      makeOutcome({ predictedConfidence: 1, realizedReturn: 0.05 }),
    );
    expect(computeCalibrationError(outcomes)).toBeCloseTo(0);
  });

  it('is positive for overconfident predictions', () => {
    const outcomes = Array.from({ length: 10 }, () =>
      makeOutcome({ predictedConfidence: 0.95, realizedReturn: -0.05 }),
    );
    expect(computeCalibrationError(outcomes)).toBeGreaterThan(0.5);
  });

  it('returns 0 for empty outcomes', () => {
    expect(computeCalibrationError([])).toBe(0);
  });
});

describe('buildAgentCalibrationScore — happy path', () => {
  it('builds a full score from valid outcomes', () => {
    const outcomes = [
      makeOutcome({ realizedReturn: 0.03 }),
      makeOutcome({ predictedDirection: 'short', realizedReturn: -0.02, thesisSurvived: false }),
    ];
    const result = buildAgentCalibrationScore(AGENT, outcomes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.sampleCount).toBe(2);
    expect(result.score.directionalAccuracy).toBe(1);
    expect(result.score.thesisSurvivalRate).toBe(0.5);
    expect(result.score.brierScore).toBeGreaterThanOrEqual(0);
    expect(result.score.expectedVsRealized.returnMae).toBeGreaterThan(0);
    expect(result.score.expectedVsRealized.volatilityMae).toBeGreaterThan(0);
  });

  it('computes regime-specific accuracy buckets', () => {
    const outcomes = [
      makeOutcome({ regime: RegimeLabel.TREND_UP, realizedReturn: 0.03 }),
      makeOutcome({ regime: RegimeLabel.TREND_UP, realizedReturn: -0.03 }),
      makeOutcome({ regime: RegimeLabel.RANGE, predictedDirection: 'neutral', realizedReturn: 0 }),
    ];
    const result = buildAgentCalibrationScore(AGENT, outcomes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.regimeAccuracy[RegimeLabel.TREND_UP].count).toBe(2);
    expect(result.score.regimeAccuracy[RegimeLabel.TREND_UP].accuracy).toBe(0.5);
    expect(result.score.regimeAccuracy[RegimeLabel.RANGE].accuracy).toBe(1);
    expect(result.score.regimeAccuracy[RegimeLabel.SHOCK]).toBeUndefined();
  });

  it('computes false-positive rate over directional predictions', () => {
    const outcomes = [
      makeOutcome({ realizedReturn: 0.03 }),
      makeOutcome({ realizedReturn: -0.03 }),
    ];
    const result = buildAgentCalibrationScore(AGENT, outcomes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.falsePositiveRate).toBe(0.5);
  });

  it('computes false-negative rate over neutral predictions', () => {
    const outcomes = [
      makeOutcome({ predictedDirection: 'neutral', realizedReturn: 0 }),
      makeOutcome({ predictedDirection: 'neutral', realizedReturn: 0.05 }),
    ];
    const result = buildAgentCalibrationScore(AGENT, outcomes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.falseNegativeRate).toBe(0.5);
  });
});

describe('buildAgentCalibrationScore — fail-closed', () => {
  it('rejects empty outcomes', () => {
    const result = buildAgentCalibrationScore(AGENT, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('at least one outcome');
  });

  it('rejects empty agent identity fields', () => {
    const result = buildAgentCalibrationScore(
      { agentRole: '' as never, providerId: '' as never, modelId: '' as never },
      [makeOutcome()],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects confidence outside [0,1]', () => {
    const result = buildAgentCalibrationScore(AGENT, [makeOutcome({ predictedConfidence: 1.5 })]);
    expect(result.ok).toBe(false);
  });

  it('rejects negative volatility', () => {
    const result = buildAgentCalibrationScore(AGENT, [makeOutcome({ predictedVolatility: -0.1 })]);
    expect(result.ok).toBe(false);
  });

  it('rejects non-finite returns', () => {
    const result = buildAgentCalibrationScore(AGENT, [makeOutcome({ realizedReturn: Number.NaN })]);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown regime', () => {
    const result = buildAgentCalibrationScore(AGENT, [makeOutcome({ regime: 'BULLISH' as never })]);
    expect(result.ok).toBe(false);
  });

  it('collects ALL invalid-outcome reasons', () => {
    const result = buildAgentCalibrationScore(AGENT, [
      makeOutcome({ predictedConfidence: 2 }),
      makeOutcome({ predictedVolatility: -1 }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
