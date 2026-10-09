export interface GKNPriceBar {
  readonly price: number;
  readonly midpoint: number;
}

export interface GKNSpreadDecompositionResult {
  readonly spread: number;
  readonly orderProcessingShare: number;
  readonly adverseSelectionShare: number;
  readonly serialCovariance: number;
  readonly priceReturnVariance: number;
}
