export interface GlostenMilgromQuote {
  readonly step: number;
  readonly trade: 'buy' | 'sell';
  readonly priorProb: number;
  readonly posteriorProb: number;
  readonly bid: number;
  readonly ask: number;
  readonly spread: number;
  readonly midPrice: number;
}

export interface GlostenMilgromParams {
  readonly vLow: number;
  readonly vHigh: number;
  readonly tradeSequence: readonly ('buy' | 'sell')[];
  readonly priorHighProb?: number;
  readonly informedProb?: number;
  readonly uninformedBuyProb?: number;
}

export interface GlostenMilgromResult {
  readonly quotes: readonly GlostenMilgromQuote[];
  readonly finalProb: number;
  readonly averageSpread: number;
  readonly adverseSelectionBps: number;
}
