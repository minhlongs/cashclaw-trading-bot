export class BessembinderKaufmanEngine {
  public static calculate(config: BessembinderKaufmanConfig): BessembinderKaufmanResult {
    const { pairs } = config;
    if (pairs.length === 0) throw new Error('At least one trade-quote pair is required');
    let sumEff = 0, sumReal = 0, sumImpact = 0;
    for (const p of pairs) {
      if (p.tradePrice <= 0 || p.prevailingMid <= 0 || p.futureMid <= 0) {
        throw new Error('Prices and midpoints must be positive');
      }
      const eff = p.tradeSign * (p.tradePrice - p.prevailingMid);
      const real = p.tradeSign * (p.tradePrice - p.futureMid);
      const imp = p.tradeSign * (p.futureMid - p.prevailingMid);
      sumEff += eff;
      sumReal += real;
      sumImpact += imp;
    }
    const n = pairs.length;
    return {
      effectiveHalfSpread: sumEff / n,
      realizedHalfSpread: sumReal / n,
      priceImpact: sumImpact / n,
      pairCount: n,
    };
  }
}

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
