/**
 * @file collateral-rebalance-router.ts
 * @description Greedy minimum-flow rebalancing solver for multi-venue synthetic margin portfolios.
 */

import type {
  CollateralTransferAction,
  MarginRouterConfig,
  PortfolioMarginReport,
  VenueAccountSnapshot,
  VenueMarginHealth,
} from './portfolio-margin-types';
import {
  DEFAULT_MARGIN_CONFIG,
  evaluateVenueMarginHealth,
} from './synthetic-margin-calculator';

export function calculatePortfolioMarginReport(
  snapshots: VenueAccountSnapshot[],
  config: MarginRouterConfig = DEFAULT_MARGIN_CONFIG
): PortfolioMarginReport {
  const venues: VenueMarginHealth[] = snapshots.map((s) => evaluateVenueMarginHealth(s, config));

  let totalCollateral = 0;
  let totalMargin = 0;
  for (const v of venues) {
    totalCollateral += v.effectiveCollateralUsd;
    totalMargin += v.requiredMaintenanceMarginUsd;
  }

  const aggregateUtilization = totalCollateral > 0 ? totalMargin / totalCollateral : totalMargin > 0 ? 1 : 0;
  const isGlobalDeficit = aggregateUtilization >= 1.0;

  const transfers: CollateralTransferAction[] = [];
  const needsRebalance = venues.some((v) => v.marginUtilization >= config.rebalanceThresholdPct);

  if (needsRebalance && !isGlobalDeficit) {
    // Solves deficit and surplus targeting targetSafeUtilizationPct
    const deficits = venues
      .filter((v) => v.marginUtilization >= config.rebalanceThresholdPct)
      .map((v) => ({
        venueId: v.venueId,
        neededUsd: Math.max(0, v.requiredMaintenanceMarginUsd / config.targetSafeUtilizationPct - v.effectiveCollateralUsd),
        health: v,
      }))
      .sort((a, b) => b.neededUsd - a.neededUsd);

    const surpluses = venues
      .filter((v) => v.marginUtilization < config.targetSafeUtilizationPct && v.effectiveCollateralUsd > 0)
      .map((v) => ({
        venueId: v.venueId,
        availableUsd: Math.max(0, v.effectiveCollateralUsd - v.requiredMaintenanceMarginUsd / config.targetSafeUtilizationPct),
        health: v,
      }))
      .sort((a, b) => b.availableUsd - a.availableUsd);

    for (const def of deficits) {
      for (const sur of surpluses) {
        if (def.neededUsd <= 0 || sur.availableUsd <= 0) continue;
        const transferAmount = Math.min(def.neededUsd, sur.availableUsd);
        if (transferAmount < config.minTransferAmountUsd) continue;

        def.neededUsd -= transferAmount;
        sur.availableUsd -= transferAmount;

        const postCollateralFrom = Math.max(1, sur.health.effectiveCollateralUsd - transferAmount);
        const postCollateralTo = def.health.effectiveCollateralUsd + transferAmount;

        transfers.push({
          fromVenueId: sur.venueId,
          toVenueId: def.venueId,
          transferAmountUsd: Math.round(transferAmount * 100) / 100,
          reason: `De-risk ${def.venueId} from ${(def.health.marginUtilization * 100).toFixed(1)}% utilization`,
          postUtilizationFrom: Math.round((sur.health.requiredMaintenanceMarginUsd / postCollateralFrom) * 1e4) / 1e4,
          postUtilizationTo: Math.round((def.health.requiredMaintenanceMarginUsd / postCollateralTo) * 1e4) / 1e4,
        });
      }
    }
  }

  return {
    venues,
    totalEffectiveCollateralUsd: Math.round(totalCollateral * 100) / 100,
    totalMaintenanceMarginUsd: Math.round(totalMargin * 100) / 100,
    aggregateUtilization: Math.round(aggregateUtilization * 1e4) / 1e4,
    isGlobalDeficit,
    recommendedTransfers: transfers,
  };
}
