// Calibration — at PAPER/SHADOW, compares LLM thesis vs CashClaw measured
// outcome. AgentCalibrationScore per (agentRole × modelId × providerId × regime).
// Forest orchestration over the tree-layer pure math (buildAgentCalibrationScore,
// computeBrierScore, computeCalibrationError, isDirectionCorrect). Realized
// outcomes are injected by the caller — this module never fetches data.

export type {
  ProvenanceOutcome,
  AgentCalibrationAggregate,
  ExpectationGap,
  RegimeGapSummary,
} from './calibration.types';
export {
  buildCalibrationAggregates,
  computeAgentCalibrationScores,
  rankUsefulness,
  computeExpectationGap,
  aggregateExpectationGapByRegime,
} from './calibration.core';
