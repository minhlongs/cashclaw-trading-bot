// Calibration types — ProvenanceOutcome, AgentCalibrationAggregate, ExpectationGap, RegimeGapSummary.

import type { CalibrationAgentKey, CalibrationOutcome } from '@/tree/research/tradingagents/calibration';
import type { AgentRole } from '@/tree/research/tradingagents';
import type { RegimeLabel } from '@/tree/regime/types';

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

/** Per-regime expectation-gap aggregate. */
export interface RegimeGapSummary {
  readonly count: number;
  readonly avgReturnGap: number;
  readonly avgVolGap: number;
  readonly directionAccuracy: number;
  readonly survivalRate: number;
}
