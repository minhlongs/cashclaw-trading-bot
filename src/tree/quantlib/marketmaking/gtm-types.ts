// Guéant-Tapia-Manziadi (2012) & Order Flow Imbalance (OFI) Types
// Pure TypeScript definitions for optimal market making and order book dynamics.

export interface GtmModelParams {
  /** Absolute risk aversion coefficient (gamma > 0). */
  readonly gamma: number;
  /** Order arrival intensity decay parameter (kappa > 0). */
  readonly kappa: number;
  /** Order arrival scale parameter (A > 0). */
  readonly A: number;
  /** Asset volatility (sigma > 0). */
  readonly sigma: number;
}

export interface GtmQuoteSpread {
  /** Distance of optimal bid from reference price (delta_b = R - p_b). */
  readonly deltaBid: number;
  /** Distance of optimal ask from reference price (delta_a = p_a - R). */
  readonly deltaAsk: number;
  /** Total optimal bid-ask spread (delta_b + delta_a). */
  readonly totalSpread: number;
  /** Baseline asymptotic half-spread (C0). */
  readonly baseHalfSpread: number;
}

export interface L2BookLevel {
  readonly price: number;
  readonly size: number;
}

export interface L2OrderBookSnapshot {
  readonly bid: L2BookLevel;
  readonly ask: L2BookLevel;
  readonly timestamp?: number;
}

export interface OfiConfig {
  /** OFI sensitivity coefficient (beta >= 0) converting OFI into price shift. */
  readonly beta: number;
  /** Maximum price shift allowed as fraction of mid price (default: 0.02 = 2%). */
  readonly maxShiftRatio?: number;
}

export interface GtmMarketMakerQuotes {
  readonly midPrice: number;
  readonly reservationPrice: number;
  readonly ofiAdjustment: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly spreads: GtmQuoteSpread;
}
