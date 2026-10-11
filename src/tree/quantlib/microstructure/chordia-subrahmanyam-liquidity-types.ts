export interface ChordiaSubrahmanyamParams {
  readonly assetSpreads: readonly number[];
  readonly marketSpreads?: readonly number[];
}

export interface ChordiaSubrahmanyamResult {
  readonly liquidityBeta: number;
  readonly commonalityRSquared: number;
  readonly downMarketBeta: number;
  readonly upMarketBeta: number;
  readonly averageAssetSpread: number;
  readonly sampleSize: number;
}
