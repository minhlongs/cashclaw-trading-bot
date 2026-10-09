export interface EasleyOharaParams {
  readonly eventProbability: number;
  readonly informedLargeFraction: number;
  readonly uninformedSmallRate: number;
  readonly uninformedLargeRate: number;
  readonly informedRate: number;
  readonly baseAssetPrice: number;
  readonly volatility: number;
}

export interface EasleyOharaResult {
  readonly pinLarge: number;
  readonly pinSmall: number;
  readonly spreadLargeBps: number;
  readonly spreadSmallBps: number;
  readonly sizeAsymmetryRatio: number;
  readonly largeOrderAdverseSelectionMarkup: number;
}
