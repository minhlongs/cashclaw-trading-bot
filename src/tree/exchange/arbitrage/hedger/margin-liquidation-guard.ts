import type { DualLegPortfolio, MarginSafetyState } from './hedger-types';

export const DEFAULT_MAINTENANCE_MARGIN_RATIO = 0.05; // 5%
export const MARGIN_WARNING_THRESHOLD_PCT = 0.70; // 70% utilization
export const MARGIN_CRITICAL_THRESHOLD_PCT = 0.85; // 85% utilization

export function evaluateMarginSafety(
  portfolio: DualLegPortfolio,
  maintenanceMarginRatio = DEFAULT_MAINTENANCE_MARGIN_RATIO,
): MarginSafetyState {
  const notionalA = Math.abs(portfolio.legA.quantity * portfolio.legA.markPrice);
  const notionalB = Math.abs(portfolio.legB.quantity * portfolio.legB.markPrice);
  const totalNotional = notionalA + notionalB;
  const totalCollateral = Math.max(0, portfolio.collateralUsd);

  const effectiveLeverage = totalCollateral > 0 ? totalNotional / totalCollateral : 0;
  const requiredMaintenanceMargin = totalNotional * maintenanceMarginRatio;

  const marginUtilizationPct =
    totalCollateral > 0 ? requiredMaintenanceMargin / totalCollateral : 1.0;

  // Approximate distance to liquidation as remaining equity ratio before reaching maintenance margin
  const liquidationDistancePct = Math.max(
    0,
    totalCollateral > 0 ? (totalCollateral - requiredMaintenanceMargin) / totalCollateral : 0,
  );

  const isMarginWarning = marginUtilizationPct >= MARGIN_WARNING_THRESHOLD_PCT;
  const isLiquidationCritical = marginUtilizationPct >= MARGIN_CRITICAL_THRESHOLD_PCT;

  return {
    totalCollateral,
    totalNotional,
    effectiveLeverage,
    marginUtilizationPct,
    liquidationDistancePct,
    isMarginWarning,
    isLiquidationCritical,
  };
}
