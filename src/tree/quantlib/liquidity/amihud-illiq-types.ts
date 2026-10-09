export interface AmihudPriceVolumeBar {
  readonly returnPct: number;
  readonly volumeUsd: number;
}

export interface AmihudIlliqConfig {
  readonly minObservations: number;
  readonly volumeFloor: number;
  readonly illiquidityThreshold: number;
  readonly scaleFactor: number;
}

export interface AmihudIlliqResult {
  readonly meanIlliquidity: number;
  readonly medianIlliquidity: number;
  readonly isIlliquidRegime: boolean;
  readonly sampleCount: number;
}
