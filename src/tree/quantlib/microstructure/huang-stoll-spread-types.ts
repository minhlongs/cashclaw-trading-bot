export interface HuangStollTradeTick {
  readonly midpoint: number;
  readonly tradeDirection: 1 | -1;
  readonly price?: number;
}

export interface HuangStollDecompositionResult {
  readonly spread: number;
  readonly orderProcessingShare: number; // alpha
  readonly inventoryHoldingShare: number; // beta
  readonly adverseSelectionShare: number; // gamma = 1 - alpha - beta
  readonly tradeContinuationProb: number; // pi = P(Q_t = Q_{t-1})
}
