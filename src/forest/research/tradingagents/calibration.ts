// Calibration — at PAPER/SHADOW, compares LLM thesis vs CashClaw measured
// outcome. AgentCalibrationScore per (agentRole × modelId × providerId × regime).
// Forest orchestration over the tree-layer pure math (buildAgentCalibrationScore,
// computeBrierScore, computeCalibrationError, isDirectionCorrect). Realized
// outcomes are injected by the caller — this module never fetches data.

import {
  buildAgentCalibrationScore,
  isDirectionCorrect,
  type AgentCalibrationScore,
  type CalibrationAgentKey,
  type CalibrationOutcome,
} from '@/tree/research/tradingagents/calibration';
import type { AgentRole } from '@/tree/research/tradingagents';
import { RegimeLabel } from '@/tree/regime/types';

/** Calibration outcome with agent provenance attached. */
export interface ProvenanceOutcome extends CalibrationOutcome {
  readonly agentRole: AgentRole;
  readonly providerId: string;
  readonly modelId: string;
}

/** Aggregated calibration per agent+model+provider+regime. */
export interface AgentCalibrationAggregate {
  readonly agent: CalibrationAgentKey;
  readonly regime: RegimeLabel;
  readonly outcomes: readonly ProvenanceOutcome[];
}

/** Build calibration scores grouped by agent×model×provider×regime. */
export function buildCalibrationAggregates(
  outcomes: readonly ProvenanceOutcome[],
): ReadonlyMap<string, AgentCalibrationAggregate> {
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

/** Compute AgentCalibrationScore for each aggregate (fail-closed per group). */
export function computeAgentCalibrationScores(
  aggregates: ReadonlyMap<string, AgentCalibrationAggregate>,
): readonly AgentCalibrationScore[] {
  const scores: AgentCalibrationScore[] = [];

  for (const agg of aggregates.values()) {
    const outcomes: CalibrationOutcome[] = agg.outcomes.map((o) => ({
      predictedDirection: o.predictedDirection,
      predictedConfidence: o.predictedConfidence,
      predictedReturn: o.predictedReturn,
      predictedVolatility: o.predictedVolatility,
      realizedReturn: o.realizedReturn,
      realizedVolatility: o.realizedVolatility,
      thesisSurvived: o.thesisSurvived,
      regime: o.regime,
    }));

    const result = buildAgentCalibrationScore(agg.agent, outcomes);
    if (result.ok) {
      scores.push(result.score);
    }
  }

  return scores;
}

/** Rank models by empirical usefulness. Deterministic total order:
 * lower Brier → higher directional accuracy → higher thesis survival →
 * stable tiebreak on agent identity (so equal scores never reorder). */
export function rankUsefulness(
  scores: readonly AgentCalibrationScore[],
): readonly AgentCalibrationScore[] {
  return [...scores].sort((a, b) => {
    if (a.brierScore !== b.brierScore) return a.brierScore - b.brierScore;
    if (a.directionalAccuracy !== b.directionalAccuracy) {
      return b.directionalAccuracy - a.directionalAccuracy;
    }
    if (a.thesisSurvivalRate !== b.thesisSurvivalRate) {
      return b.thesisSurvivalRate - a.thesisSurvivalRate;
    }
    const aKey = `${a.agent.agentRole}|${a.agent.providerId}|${a.agent.modelId}`;
    const bKey = `${b.agent.agentRole}|${b.agent.providerId}|${b.agent.modelId}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

/** Expected vs realized gap for a single prediction (carries regime). */
export interface ExpectationGap {
  readonly predictedDirection: 'long' | 'short' | 'neutral';
  readonly predictedReturn: number;
  readonly realizedReturn: number;
  readonly returnGap: number;
  readonly predictedVolatility: number;
  readonly realizedVolatility: number;
  readonly volatilityGap: number;
  readonly directionCorrect: boolean;
  readonly confidence: number;
  readonly thesisSurvived: boolean;
  readonly regime: RegimeLabel;
}

/** Compute expectation gap for one outcome. */
export function computeExpectationGap(outcome: CalibrationOutcome): ExpectationGap {
  return {
    predictedDirection: outcome.predictedDirection,
    predictedReturn: outcome.predictedReturn,
    realizedReturn: outcome.realizedReturn,
    returnGap: Math.abs(outcome.predictedReturn - outcome.realizedReturn),
    predictedVolatility: outcome.predictedVolatility,
    realizedVolatility: outcome.realizedVolatility,
    volatilityGap: Math.abs(outcome.predictedVolatility - outcome.realizedVolatility),
    directionCorrect: isDirectionCorrect(outcome),
    confidence: outcome.predictedConfidence,
    thesisSurvived: outcome.thesisSurvived,
    regime: outcome.regime,
  };
}

/** Per-regime expectation-gap aggregate. */
export interface RegimeGapSummary {
  readonly count: number;
  readonly avgReturnGap: number;
  readonly avgVolGap: number;
  readonly directionAccuracy: number;
  readonly survivalRate: number;
}

/** Aggregate expectation gaps by regime (real grouping, no stub). */
export function aggregateExpectationGapByRegime(
  gaps: readonly ExpectationGap[],
): ReadonlyMap<RegimeLabel, RegimeGapSummary> {
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
