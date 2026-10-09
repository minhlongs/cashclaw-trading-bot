export interface ContKukanovPlacementConfig {
  readonly bidAskSpread: number;
  readonly limitOrderFeeRate?: number;
  readonly marketOrderFeeRate?: number;
  readonly adverseSelectionCost?: number;
  readonly nonExecutionPenalty?: number;
  readonly fillDecayRate?: number;
  readonly numGridSteps?: number;
}

export interface ContKukanovPlacementResult {
  readonly totalOrderQuantity: number;
  readonly optimalLimitQuantity: number;
  readonly optimalMarketQuantity: number;
  readonly limitRatio: number;
  readonly expectedCost: number;
  readonly expectedFillProbability: number;
  readonly makerSavingsBps: number;
}
