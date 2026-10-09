export interface LsbSpreadParams {
  readonly transactionPrices: readonly number[];
  readonly quoteMidpoints?: readonly number[];
  readonly tradeSigns?: readonly number[];
}

export interface LsbSpreadResult {
  readonly effectiveSpread: number;
  readonly adverseSelectionRatio: number; // lambda in [0, 1]
  readonly orderProcessingRatio: number; // 1 - lambda
  readonly adverseSelectionSpread: number; // lambda * S
  readonly orderProcessingSpread: number; // (1 - lambda) * S
  readonly sampleSize: number;
}
