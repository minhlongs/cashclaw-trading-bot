export interface KyleCrossAssetParams {
  readonly assets: readonly string[];
  readonly assetVariances: readonly number[];
  readonly crossAssetCorrelation: number;
  readonly noiseVolatilities: readonly number[];
  readonly orderFlows: readonly number[];
}

export interface KyleCrossAssetResult {
  readonly assets: readonly string[];
  readonly lambdaMatrix: readonly (readonly number[])[];
  readonly priceImpacts: readonly number[];
  readonly eigenLiquidity: readonly number[];
  readonly totalAdverseSelectionCost: number;
}
