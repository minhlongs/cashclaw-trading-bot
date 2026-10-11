export interface KyleCournotParams {
  readonly numInformedTraders: number;
  readonly assetVariance: number;
  readonly noiseVariance: number;
  readonly initialPrice: number;
  readonly fundamentalValue: number;
}

export interface KyleCournotResult {
  readonly traderAggressiveness: number;
  readonly priceImpactLambda: number;
  readonly marketDepth: number;
  readonly clearingPrice: number;
  readonly aggregateInformedFlow: number;
  readonly expectedTraderProfit: number;
  readonly residualUncertainty: number;
  readonly priceEfficiencyRatio: number;
}
