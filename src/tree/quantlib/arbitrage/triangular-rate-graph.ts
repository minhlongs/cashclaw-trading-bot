import type { RateGraphEdge } from './triangular-types';

export interface MarketTickerQuote {
  readonly pair: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly askPrice: number;
  readonly bidPrice: number;
  readonly askSize: number;
  readonly bidSize: number;
  readonly feeBps?: number;
}

export function buildRateGraphEdges(
  quotes: readonly MarketTickerQuote[],
  defaultFeeBps = 7.5,
): readonly RateGraphEdge[] {
  const edges: RateGraphEdge[] = [];

  for (const q of quotes) {
    const feeBps = q.feeBps ?? defaultFeeBps;
    const feeFactor = 1 - feeBps / 10_000;

    // Direct leg: buy base with quote (pay askPrice) -> quoteAsset -> baseAsset
    // Rate = 1 / askPrice
    if (q.askPrice > 0 && q.askSize > 0) {
      const rate = 1 / q.askPrice;
      const effectiveRate = rate * feeFactor;
      if (effectiveRate > 0) {
        edges.push({
          fromSymbol: q.quoteAsset,
          toSymbol: q.baseAsset,
          rate,
          feeBps,
          depthSize: q.askSize * q.askPrice, // Depth in quote currency
          logWeight: -Math.log(effectiveRate),
        });
      }
    }

    // Reverse leg: sell base for quote (receive bidPrice) -> baseAsset -> quoteAsset
    // Rate = bidPrice
    if (q.bidPrice > 0 && q.bidSize > 0) {
      const rate = q.bidPrice;
      const effectiveRate = rate * feeFactor;
      if (effectiveRate > 0) {
        edges.push({
          fromSymbol: q.baseAsset,
          toSymbol: q.quoteAsset,
          rate,
          feeBps,
          depthSize: q.bidSize, // Depth in base currency
          logWeight: -Math.log(effectiveRate),
        });
      }
    }
  }

  return edges;
}
