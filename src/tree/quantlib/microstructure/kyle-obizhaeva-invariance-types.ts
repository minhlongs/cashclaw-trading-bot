export interface KyleObizhaevaConfig {
  readonly dailyVolumeUsd: number;
  readonly dailyVolatility: number;
  readonly betScaleConstant?: number;
  readonly impactScaleConstant?: number;
  readonly impactPower?: number;
}

export interface KyleObizhaevaImpactResult {
  readonly orderSizeUsd: number;
  readonly tradingVelocity: number;
  readonly invariantBetSize: number;
  readonly normalizedTradeSize: number;
  readonly priceImpactBps: number;
  readonly isCapacityConstrained: boolean;
}
