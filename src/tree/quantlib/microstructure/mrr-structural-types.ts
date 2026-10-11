export interface MrrStructuralParams {
  readonly tradeSigns: readonly number[];
  readonly adverseSelection: number;
  readonly orderProcessingCost: number;
  readonly autocorrelation?: number;
  readonly midPrice?: number;
}

export interface MrrStructuralResult {
  readonly spread: number;
  readonly halfSpread: number;
  readonly adverseSelectionShare: number;
  readonly orderProcessingShare: number;
  readonly predictedInnovations: readonly number[];
  readonly cumulativePriceChange: number;
}
