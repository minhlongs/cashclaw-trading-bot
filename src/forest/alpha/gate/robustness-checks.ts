/**
 * Robustness, leakage invariance, and provenance checks 9-15 for Phase 9 Promotion Gate.
 * Verifies parameter stability, walk-forward OOS consistency, causality, and reproducibility.
 */

import type { GateCheck } from './types';

export {
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from './robustness-checks-invariance';

/** Check 9: parameterRobustness — Normalized parameter sensitivity spread <= 0.5. */
export function checkParameterRobustness(spread: number, threshold = 0.5): GateCheck {
  const valid = Number.isFinite(spread);
  const passed = valid && spread >= 0 && spread <= threshold;
  return {
    name: 'parameter_robustness',
    passed,
    actual: valid ? spread : null,
    threshold,
    detail: valid
      ? `Parameter sensitivity spread ${spread.toFixed(4)} vs. maximum ${threshold}`
      : `Invalid parameter sensitivity spread: ${spread}`,
  };
}

/** Check 10: crossPeriodRobustness — Walk-forward consistency >= 60% positive OOS windows. */
export function checkCrossPeriodRobustness(positiveFraction: number, threshold = 0.60): GateCheck {
  const valid = Number.isFinite(positiveFraction);
  const passed = valid && positiveFraction >= threshold && positiveFraction <= 1.0;
  return {
    name: 'cross_period_robustness',
    passed,
    actual: valid ? positiveFraction : null,
    threshold,
    detail: valid
      ? `Walk-forward positive OOS windows ${(positiveFraction * 100).toFixed(1)}% vs. minimum ${(threshold * 100).toFixed(0)}%`
      : `Invalid walk-forward positive fraction: ${positiveFraction}`,
  };
}

/** Check 11: crossAssetRobustness — Multi-symbol consistency across correlated assets (>= 50% or exempt). */
export function checkCrossAssetRobustness(
  positiveAssetFraction?: number | null,
  applicable = true,
  threshold = 0.50,
): GateCheck {
  if (!applicable) {
    return {
      name: 'cross_asset_robustness',
      passed: true,
      actual: null,
      threshold,
      detail: 'Exempted: asset-specific strategy declaration',
    };
  }
  const valid = typeof positiveAssetFraction === 'number' && Number.isFinite(positiveAssetFraction);
  const passed = valid && positiveAssetFraction >= threshold && positiveAssetFraction <= 1.0;
  return {
    name: 'cross_asset_robustness',
    passed,
    actual: valid ? positiveAssetFraction : null,
    threshold,
    detail: valid
      ? `Cross-asset positive fraction ${(positiveAssetFraction * 100).toFixed(1)}% vs. minimum ${(threshold * 100).toFixed(0)}%`
      : 'Cross-asset fraction missing or invalid for multi-asset strategy',
  };
}
