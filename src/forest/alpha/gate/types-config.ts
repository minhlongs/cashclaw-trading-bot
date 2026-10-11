export interface PromotionGateConfig {
  readonly minTrades: number;
  readonly minNetExpectancy: number;
  readonly minProfitFactor: number;
  readonly maxDrawdown: number;
  readonly minSharpe: number;
  readonly minSortino: number;
  readonly minRegimeCoverage: number;
  readonly maxParameterSpread: number;
  readonly minCrossPeriodConsistency: number;
  readonly minCrossAssetConsistency: number;
  readonly maxSingleWindowContribution: number;
}

export const DEFAULT_PROMOTION_GATE_CONFIG: PromotionGateConfig = {
  minTrades: 30,
  minNetExpectancy: 0.0,
  minProfitFactor: 1.2,
  maxDrawdown: 0.25,
  minSharpe: 1.0,
  minSortino: 1.2,
  minRegimeCoverage: 0.50,
  maxParameterSpread: 0.50,
  minCrossPeriodConsistency: 0.60,
  minCrossAssetConsistency: 0.50,
  maxSingleWindowContribution: 0.50,
};
