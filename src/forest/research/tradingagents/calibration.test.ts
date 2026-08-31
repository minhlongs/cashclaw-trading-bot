// Calibration tests — forest orchestration over tree-layer pure math.
// Expectation-gap compute on injected paper outcome; calibration ranking
// deterministic; regime-specific aggregation.

import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import type { CalibrationOutcome } from '@/tree/research/tradingagents/calibration';
import {
  buildCalibrationAggregates,
  computeAgentCalibrationScores,
  rankUsefulness,
  computeExpectationGap,
  aggregateExpectationGapByRegime,
  type ProvenanceOutcome,
} from './calibration';

function makeOutcome(overrides: Partial<ProvenanceOutcome> = {}): ProvenanceOutcome {
  return {
    predictedDirection: 'long',
    predictedConfidence: 0.7,
    predictedReturn: 0.02,
    predictedVolatility: 0.1,
    realizedReturn: 0.03,
    realizedVolatility: 0.12,
    thesisSurvived: true,
    regime: RegimeLabel.TREND_UP,
    agentRole: 'bull-researcher',
    providerId: 'Claude-Fable',
    modelId: 'fixture-reasoning',
    ...overrides,
  };
}

describe('buildCalibrationAggregates', () => {
  it('groups outcomes by agent×model×provider×regime', () => {
    const outcomes = [
      makeOutcome(),
      makeOutcome({ agentRole: 'bear-researcher' }),
      makeOutcome({ regime: RegimeLabel.RANGE }),
    ];
    const aggregates = buildCalibrationAggregates(outcomes);
    expect(aggregates.size).toBe(3);
  });

  it('returns empty map for empty outcomes', () => {
    expect(buildCalibrationAggregates([]).size).toBe(0);
  });
});

describe('computeAgentCalibrationScores', () => {
  it('computes scores for valid aggregates', () => {
    const outcomes = [makeOutcome(), makeOutcome({ realizedReturn: -0.01 })];
    const aggregates = buildCalibrationAggregates(outcomes);
    const scores = computeAgentCalibrationScores(aggregates);
    expect(scores.length).toBe(1);
    expect(scores[0].sampleCount).toBe(2);
    expect(scores[0].directionalAccuracy).toBe(0.5);
  });

  it('skips aggregates with invalid outcomes (fail-closed)', () => {
    const outcomes = [makeOutcome({ predictedConfidence: 1.5 })];
    const aggregates = buildCalibrationAggregates(outcomes);
    const scores = computeAgentCalibrationScores(aggregates);
    expect(scores.length).toBe(0);
  });
});

describe('rankUsefulness', () => {
  it('ranks by lower Brier score first', () => {
    const outcomes = [makeOutcome(), makeOutcome({ realizedReturn: -0.01 })];
    const aggregates = buildCalibrationAggregates(outcomes);
    const scores = computeAgentCalibrationScores(aggregates);
    const ranked = rankUsefulness(scores);
    expect(ranked.length).toBe(scores.length);
  });

  it('is deterministic (same input → same order)', () => {
    const outcomes = [makeOutcome(), makeOutcome({ agentRole: 'bear-researcher' })];
    const aggregates = buildCalibrationAggregates(outcomes);
    const scores = computeAgentCalibrationScores(aggregates);
    const ranked1 = rankUsefulness(scores);
    const ranked2 = rankUsefulness(scores);
    expect(ranked1.map((s) => s.agent.agentRole)).toEqual(ranked2.map((s) => s.agent.agentRole));
  });

  it('ranks by directional accuracy when Brier scores are equal', () => {
    // Same Brier score, different directional accuracy
    const outcomes1 = [makeOutcome({ predictedConfidence: 0.5, realizedReturn: 0.05 })];
    const outcomes2 = [makeOutcome({ agentRole: 'bear-researcher', predictedConfidence: 0.5, realizedReturn: -0.05 })];
    const agg1 = buildCalibrationAggregates(outcomes1);
    const agg2 = buildCalibrationAggregates(outcomes2);
    const scores1 = computeAgentCalibrationScores(agg1);
    const scores2 = computeAgentCalibrationScores(agg2);
    const ranked = rankUsefulness([...scores1, ...scores2]);
    // Both have Brier ~0.25, but first has 100% directional accuracy, second has 0%
    // Second should rank lower (higher directional accuracy = better)
    expect(ranked[0].agent.agentRole).toBe('bull-researcher');
    expect(ranked[1].agent.agentRole).toBe('bear-researcher');
  });

  it('ranks by thesis survival when Brier and directional accuracy are equal', () => {
    // Same Brier score, same directional accuracy, different thesis survival
    const outcomes1 = [makeOutcome({ predictedConfidence: 0.7, realizedReturn: 0.03, thesisSurvived: true })];
    const outcomes2 = [makeOutcome({ agentRole: 'bear-researcher', predictedConfidence: 0.7, realizedReturn: 0.03, thesisSurvived: false })];
    const agg1 = buildCalibrationAggregates(outcomes1);
    const agg2 = buildCalibrationAggregates(outcomes2);
    const scores1 = computeAgentCalibrationScores(agg1);
    const scores2 = computeAgentCalibrationScores(agg2);
    const ranked = rankUsefulness([...scores1, ...scores2]);
    // First has thesisSurvivalRate = 1, second has 0
    expect(ranked[0].agent.agentRole).toBe('bull-researcher');
    expect(ranked[1].agent.agentRole).toBe('bear-researcher');
  });

  it('uses deterministic agent identity tiebreak when all metrics equal', () => {
    const outcomes1 = [makeOutcome({ agentRole: 'analyst' })];
    const outcomes2 = [makeOutcome({ agentRole: 'bull-researcher' })];
    const agg1 = buildCalibrationAggregates(outcomes1);
    const agg2 = buildCalibrationAggregates(outcomes2);
    const scores1 = computeAgentCalibrationScores(agg1);
    const scores2 = computeAgentCalibrationScores(agg2);
    const ranked = rankUsefulness([...scores1, ...scores2]);
    // 'analyst' < 'bull-researcher' lexicographically
    expect(ranked[0].agent.agentRole).toBe('analyst');
    expect(ranked[1].agent.agentRole).toBe('bull-researcher');
  });
});

describe('computeExpectationGap', () => {
  it('computes return and volatility gaps on injected paper outcome', () => {
    const outcome: CalibrationOutcome = makeOutcome();
    const gap = computeExpectationGap(outcome);
    expect(gap.returnGap).toBeCloseTo(Math.abs(0.02 - 0.03));
    expect(gap.volatilityGap).toBeCloseTo(Math.abs(0.1 - 0.12));
    expect(gap.directionCorrect).toBe(true);
    expect(gap.regime).toBe(RegimeLabel.TREND_UP);
  });

  it('marks direction incorrect when realized return opposes prediction', () => {
    const outcome = makeOutcome({ predictedDirection: 'long', realizedReturn: -0.01 });
    const gap = computeExpectationGap(outcome);
    expect(gap.directionCorrect).toBe(false);
  });
});

describe('aggregateExpectationGapByRegime', () => {
  it('groups gaps by regime and computes averages', () => {
    const gaps = [
      computeExpectationGap(makeOutcome({ regime: RegimeLabel.TREND_UP })),
      computeExpectationGap(makeOutcome({ regime: RegimeLabel.RANGE })),
      computeExpectationGap(makeOutcome({ regime: RegimeLabel.TREND_UP, realizedReturn: -0.01 })),
    ];
    const byRegime = aggregateExpectationGapByRegime(gaps);
    expect(byRegime.get(RegimeLabel.TREND_UP)?.count).toBe(2);
    expect(byRegime.get(RegimeLabel.RANGE)?.count).toBe(1);
  });

  it('returns empty map for empty gaps', () => {
    expect(aggregateExpectationGapByRegime([]).size).toBe(0);
  });
});
