import type { PairSimConfig } from './types';

export const OBSERVATION_FLOOR = 10;

export const VALIDATION_REASONS = {
  insufficientObservations: 'insufficient observations for tradability gate',
  notCointegrated: 'pair is not cointegrated (pValue >= 0.05)',
  halfLifeNonFinite: 'half-life is non-finite (no mean-reversion evidence)',
  halfLifeTooLong: 'half-life exceeds maxHalfLife',
  correlationBelowFloor: '|correlation| below minCorrelation floor',
} as const;

export type TradabilityGateConfig = Pick<
  PairSimConfig,
  'validationWindow' | 'minObs' | 'maxHalfLife' | 'minCorrelation'
>;

export interface PairValidationDiagnostics {
  readonly correlation: number;
  readonly cointegrated: boolean;
  readonly pValue: number;
  readonly halfLife: number | null;
  readonly observationCount: number;
}

export interface PairValidationResult {
  readonly tradable: boolean;
  readonly reasons: readonly string[];
  readonly diagnostics: PairValidationDiagnostics;
}
