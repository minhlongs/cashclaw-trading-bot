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

export const ECE_BINS = 10;

const regimeValues = Object.values(RegimeLabel) as [string, ...string[]];

export const calibrationOutcomeSchema = z.object({
  predictedDirection: z.enum(['long', 'short', 'neutral']),
  predictedConfidence: z.number().min(0).max(1),
  predictedReturn: z.number().finite(),
  predictedVolatility: z.number().finite().nonnegative(),
  realizedReturn: z.number().finite(),
  realizedVolatility: z.number().finite().nonnegative(),
  thesisSurvived: z.boolean(),
  regime: z.enum(regimeValues),
});
