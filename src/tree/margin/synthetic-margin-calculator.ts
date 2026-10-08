/**
 * @file synthetic-margin-calculator.ts
 * @description Evaluates haircut-discounted effective collateral, maintenance margin, and liquidation distances.
 */

import type {
  AssetBalance,
  MarginHealthStatus,
  MarginRouterConfig,
  PositionNotional,
  VenueAccountSnapshot,
  VenueMarginHealth,
} from './portfolio-margin-types';

export const DEFAULT_MARGIN_CONFIG: MarginRouterConfig = {
  rebalanceThresholdPct: 0.75,
  criticalThresholdPct: 0.85,
  targetSafeUtilizationPct: 0.55,
  minTransferAmountUsd: 100,
  assetHaircuts: {
    USDT: 1.0,
    USDC: 1.0,
    USD: 1.0,
    BTC: 0.9,
    ETH: 0.85,
    SOL: 0.7,
  },
};

export function calculateEffectiveCollateral(
  balances: AssetBalance[],
  haircuts: Record<string, number>
): { nominalUsd: number; effectiveUsd: number } {
  let nominalUsd = 0;
  let effectiveUsd = 0;

  for (const b of balances) {
    const valueUsd = b.amount * b.priceUsd;
    if (valueUsd <= 0) continue;
    const haircutFactor = Math.max(0, Math.min(1, haircuts[b.asset] ?? 0.5));
    nominalUsd += valueUsd;
    effectiveUsd += valueUsd * haircutFactor;
  }

  return {
    nominalUsd: Math.round(nominalUsd * 100) / 100,
    effectiveUsd: Math.round(effectiveUsd * 100) / 100,
  };
}

export function calculateRequiredMaintenanceMargin(
  positions: PositionNotional[]
): number {
  let totalMargin = 0;
  for (const p of positions) {
    if (p.notionalUsd <= 0 || p.maintenanceMarginRate <= 0) continue;
    totalMargin += p.notionalUsd * p.maintenanceMarginRate;
  }
  return Math.round(totalMargin * 100) / 100;
}

export function evaluateVenueMarginHealth(
  snapshot: VenueAccountSnapshot,
  config: MarginRouterConfig = DEFAULT_MARGIN_CONFIG
): VenueMarginHealth {
  const { nominalUsd, effectiveUsd } = calculateEffectiveCollateral(snapshot.balances, config.assetHaircuts);
  const maintenanceUsd = calculateRequiredMaintenanceMargin(snapshot.positions);

  let utilization = 0;
  if (effectiveUsd > 0) {
    utilization = maintenanceUsd / effectiveUsd;
  } else if (maintenanceUsd > 0) {
    utilization = 1.0;
  }

  const liquidationDistanceUsd = Math.max(0, effectiveUsd - maintenanceUsd);
  let status: MarginHealthStatus = 'SAFE';

  if (utilization >= config.criticalThresholdPct) {
    status = 'CRITICAL';
  } else if (utilization >= config.rebalanceThresholdPct) {
    status = 'REBALANCE_TRIGGERED';
  } else if (utilization >= 0.6) {
    status = 'WARNING';
  }

  return {
    venueId: snapshot.venueId,
    nominalCollateralUsd: nominalUsd,
    effectiveCollateralUsd: effectiveUsd,
    requiredMaintenanceMarginUsd: maintenanceUsd,
    marginUtilization: Math.round(utilization * 1e4) / 1e4,
    liquidationDistanceUsd: Math.round(liquidationDistanceUsd * 100) / 100,
    status,
  };
}
