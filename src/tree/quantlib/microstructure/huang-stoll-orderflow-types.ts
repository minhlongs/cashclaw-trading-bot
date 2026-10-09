export interface HuangStollOrderFlowParams {
  readonly prices: readonly number[];
  readonly tradeSigns?: readonly number[]; // +1 buy, -1 sell (auto-inferred if omitted)
  readonly lag?: number; // default 1
}

export interface HuangStollOrderFlowResult {
  readonly effectiveSpread: number;
  readonly adverseSelectionRatio: number; // alpha in [0, 1]
  readonly inventoryHoldingRatio: number; // beta in [0, 1]
  readonly orderProcessingRatio: number; // 1 - alpha - beta in [0, 1]
  readonly tradeAutocorrelation: number;
  readonly sampleSize: number;
}
