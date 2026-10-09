export interface GlostenHarrisTradeTick {
  readonly price: number;
  readonly tradeDirection: 1 | -1;
  readonly volume?: number;
}

export interface GlostenHarrisDecompositionResult {
  readonly spread: number;
  readonly halfSpread: number;
  readonly orderProcessingCost: number;
  readonly adverseSelectionCost: number;
  readonly orderProcessingShare: number;
  readonly adverseSelectionShare: number;
  readonly rSquared: number;
}
