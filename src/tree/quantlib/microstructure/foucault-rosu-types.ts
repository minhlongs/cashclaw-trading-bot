export interface FoucaultRosuParams {
  readonly fastTraderArrivalRate: number;
  readonly cancelRateSlowTraders: number;
  readonly fundamentalVolatility: number;
  readonly baseAssetPrice: number;
  readonly tickSize: number;
  readonly inventoryHoldingCost: number;
}

export interface FoucaultRosuResult {
  readonly snipingProbability: number;
  readonly equilibriumSpreadBps: number;
  readonly adverseSelectionShare: number;
  readonly fastTraderRentBps: number;
  readonly effectiveDepthFactor: number;
}
