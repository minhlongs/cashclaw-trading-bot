import { isDirectionCorrect, type AgentCalibrationScore, type CalibrationOutcome } from '@/tree/research/tradingagents/calibration';
import type { RegimeLabel } from '@/tree/regime/types';
import type { ExpectationGap, RegimeGapSummary } from './calibration.types';

export function rankUsefulness(scores: readonly AgentCalibrationScore[]): readonly AgentCalibrationScore[] {
  return [...scores].sort((a, b) => {
    if (a.brierScore !== b.brierScore) return a.brierScore - b.brierScore;
    if (a.directionalAccuracy !== b.directionalAccuracy) return b.directionalAccuracy - a.directionalAccuracy;
    if (a.thesisSurvivalRate !== b.thesisSurvivalRate) return b.thesisSurvivalRate - a.thesisSurvivalRate;
    const aKey = `${a.agent.agentRole}|${a.agent.providerId}|${a.agent.modelId}`;
    const bKey = `${b.agent.agentRole}|${b.agent.providerId}|${b.agent.modelId}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

export function computeExpectationGap(outcome: CalibrationOutcome): ExpectationGap {
  return {
    predictedDirection: outcome.predictedDirection, predictedReturn: outcome.predictedReturn,
    realizedReturn: outcome.realizedReturn, returnGap: Math.abs(outcome.predictedReturn - outcome.realizedReturn),
    predictedVolatility: outcome.predictedVolatility, realizedVolatility: outcome.realizedVolatility,
    volatilityGap: Math.abs(outcome.predictedVolatility - outcome.realizedVolatility),
    directionCorrect: isDirectionCorrect(outcome), confidence: outcome.predictedConfidence,
    thesisSurvived: outcome.thesisSurvived, regime: outcome.regime,
  };
}

export function aggregateExpectationGapByRegime(gaps: readonly ExpectationGap[]): ReadonlyMap<RegimeLabel, RegimeGapSummary> {
  const byRegime = new Map<RegimeLabel, ExpectationGap[]>();
  for (const gap of gaps) {
    const existing = byRegime.get(gap.regime) ?? [];
    byRegime.set(gap.regime, [...existing, gap]);
  }
  const result = new Map<RegimeLabel, RegimeGapSummary>();
  for (const [regime, list] of byRegime) {
    result.set(regime, {
      count: list.length,
      avgReturnGap: list.reduce((s, g) => s + g.returnGap, 0) / list.length,
      avgVolGap: list.reduce((s, g) => s + g.volatilityGap, 0) / list.length,
      directionAccuracy: list.filter((g) => g.directionCorrect).length / list.length,
      survivalRate: list.filter((g) => g.thesisSurvived).length / list.length,
    });
  }
  return result;
}
