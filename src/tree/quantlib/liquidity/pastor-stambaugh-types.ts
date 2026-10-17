export interface PastorStambaughBar {
  readonly assetReturn: number;
  readonly marketReturn: number;
  readonly dollarVolume: number;
}

export interface PastorStambaughConfig {
  readonly bars: readonly PastorStambaughBar[];
}

export interface PastorStambaughResult {
  readonly gammaLiquidity: number;
  readonly phiAutocorrelation: number;
  readonly reversalStrength: number;
  readonly transitionCount: number;
}
