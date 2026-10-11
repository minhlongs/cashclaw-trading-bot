export interface HasbrouckTradeImpactParams {
  readonly tradeInnovations: readonly number[];
  readonly returns: readonly number[];
  readonly lagOrder?: number;
}

export interface HasbrouckTradeImpactResult {
  readonly permanentImpact: number;
  readonly transientImpact: number;
  readonly informationShare: number;
  readonly tradeInnovationVariance: number;
  readonly returnVariance: number;
}
