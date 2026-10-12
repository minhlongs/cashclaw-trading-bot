export interface TradeQuotePair {
  readonly tradePrice: number;
  readonly tradeSign: 1 | -1;
  readonly prevailingMid: number;
  readonly futureMid: number;
}

export interface BessembinderKaufmanConfig {
  readonly pairs: readonly TradeQuotePair[];
}

export interface BessembinderKaufmanResult {
  readonly effectiveHalfSpread: number;
  readonly realizedHalfSpread: number;
  readonly priceImpact: number;
  readonly pairCount: number;
}
