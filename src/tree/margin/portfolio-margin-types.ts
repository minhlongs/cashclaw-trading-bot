/**
 * @file portfolio-margin-types.ts
 * @description Types for multi-venue unified collateral, haircut discounting, and portfolio margin rebalancing.
 */

export interface AssetBalance {
  asset: string;
  amount: number;
  priceUsd: number;
}

export interface PositionNotional {
  symbol: string;
  notionalUsd: number;
  maintenanceMarginRate: number; // e.g. 0.05 for 20x max leverage
}

export interface VenueAccountSnapshot {
  venueId: string;
  balances: AssetBalance[];
  positions: PositionNotional[];
}

export type MarginHealthStatus = 'SAFE' | 'WARNING' | 'REBALANCE_TRIGGERED' | 'CRITICAL';

export interface VenueMarginHealth {
  venueId: string;
  nominalCollateralUsd: number;
  effectiveCollateralUsd: number;
  requiredMaintenanceMarginUsd: number;
  marginUtilization: number;
  liquidationDistanceUsd: number;
  status: MarginHealthStatus;
}

export interface CollateralTransferAction {
  fromVenueId: string;
  toVenueId: string;
  transferAmountUsd: number;
  reason: string;
  postUtilizationFrom: number;
  postUtilizationTo: number;
}

export interface MarginRouterConfig {
  rebalanceThresholdPct: number;    // default: 0.75 (75%)
  criticalThresholdPct: number;     // default: 0.85 (85%)
  targetSafeUtilizationPct: number; // default: 0.55 (55%)
  minTransferAmountUsd: number;     // default: 100
  assetHaircuts: Record<string, number>; // asset -> haircut discount factor (e.g. BTC: 0.90)
}

export interface PortfolioMarginReport {
  venues: VenueMarginHealth[];
  totalEffectiveCollateralUsd: number;
  totalMaintenanceMarginUsd: number;
  aggregateUtilization: number;
  isGlobalDeficit: boolean;
  recommendedTransfers: CollateralTransferAction[];
}
