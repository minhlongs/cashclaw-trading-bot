export interface MrrSpreadParams {
  readonly prices: readonly number[];
  readonly tradeSigns?: readonly number[]; // +1 buy, -1 sell (auto-inferred if omitted)
}

export interface MrrSpreadResult {
  readonly effectiveSpread: number; // 2 * (phi + theta)
  readonly adverseSelection: number; // theta (private information)
  readonly orderProcessing: number; // phi (friction/processing)
  readonly tradeAutocorrelation: number; // gamma in [-1, 1]
  readonly sampleSize: number;
}
