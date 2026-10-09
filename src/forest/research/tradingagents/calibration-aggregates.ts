import {
  buildAgentCalibrationScore,
  type AgentCalibrationScore,
  type CalibrationOutcome,
} from '@/tree/research/tradingagents/calibration';
import type { AgentRole } from '@/tree/research/tradingagents';
import type { RegimeLabel } from '@/tree/regime/types';
import type { ProvenanceOutcome, AgentCalibrationAggregate } from './calibration.types';

export function buildCalibrationAggregates(outcomes: readonly ProvenanceOutcome[]): ReadonlyMap<string, AgentCalibrationAggregate> {
  const groups = new Map<string, ProvenanceOutcome[]>();
  for (const o of outcomes) {
    const key = `${o.agentRole}|${o.providerId}|${o.modelId}|${o.regime}`;
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, o]);
  }
  const aggregates = new Map<string, AgentCalibrationAggregate>();
  for (const [key, outs] of groups) {
    const [agentRole, providerId, modelId, regime] = key.split('|');
    aggregates.set(key, {
      agent: { agentRole: agentRole as AgentRole, providerId, modelId },
      regime: regime as RegimeLabel,
      outcomes: outs,
    });
  }
  return aggregates;
}

export function computeAgentCalibrationScores(aggregates: ReadonlyMap<string, AgentCalibrationAggregate>): readonly AgentCalibrationScore[] {
  const scores: AgentCalibrationScore[] = [];
  for (const agg of aggregates.values()) {
    const outcomes: CalibrationOutcome[] = agg.outcomes.map((o) => ({
      predictedDirection: o.predictedDirection, predictedConfidence: o.predictedConfidence,
      predictedReturn: o.predictedReturn, predictedVolatility: o.predictedVolatility,
      realizedReturn: o.realizedReturn, realizedVolatility: o.realizedVolatility,
      thesisSurvived: o.thesisSurvived, regime: o.regime,
    }));
    const result = buildAgentCalibrationScore(agg.agent, outcomes);
    if (result.ok) scores.push(result.score);
  }
  return scores;
}
