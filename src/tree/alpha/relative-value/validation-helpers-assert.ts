import type { PairPanel } from './types';
import { assertPositiveCloses } from './pair-period';
import {
  type PairValidationDiagnostics,
  type TradabilityGateConfig,
  VALIDATION_REASONS,
} from './validation-helpers-types';

export function failedReasons(
  requiredObs: number, diagnostics: PairValidationDiagnostics, maxHalfLife: number, minCorrelation: number,
): string[] {
  const reasons: string[] = [];
  if (diagnostics.observationCount < requiredObs) reasons.push(VALIDATION_REASONS.insufficientObservations);
  if (!diagnostics.cointegrated) reasons.push(VALIDATION_REASONS.notCointegrated);
  if (diagnostics.halfLife === null) {
    reasons.push(VALIDATION_REASONS.halfLifeNonFinite);
  } else if (diagnostics.halfLife > maxHalfLife) {
    reasons.push(VALIDATION_REASONS.halfLifeTooLong);
  }
  if (Math.abs(diagnostics.correlation) < minCorrelation) reasons.push(VALIDATION_REASONS.correlationBelowFloor);
  return reasons;
}

export function assertInputs(panel: PairPanel, config: TradabilityGateConfig, asOfTime: number): void {
  if (panel.timestamps.length !== panel.closesA.length || panel.timestamps.length !== panel.closesB.length) {
    throw new Error('validatePairTradable: panel array lengths differ');
  }
  assertPositiveCloses(panel, 'validatePairTradable');
  if (!Number.isInteger(config.validationWindow) || config.validationWindow <= 0) {
    throw new Error('validatePairTradable: validationWindow must be a positive integer');
  }
  if (!Number.isInteger(config.minObs) || config.minObs <= 0) {
    throw new Error('validatePairTradable: minObs must be a positive integer');
  }
  if (!Number.isFinite(config.maxHalfLife) || config.maxHalfLife <= 0) {
    throw new Error('validatePairTradable: maxHalfLife must be a positive finite number');
  }
  if (!Number.isFinite(config.minCorrelation) || config.minCorrelation < 0 || config.minCorrelation > 1) {
    throw new Error('validatePairTradable: minCorrelation must be within [0, 1]');
  }
  if (Number.isNaN(asOfTime)) {
    throw new Error('validatePairTradable: asOfTime must not be NaN');
  }
}
