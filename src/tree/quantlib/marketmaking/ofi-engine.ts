// Order Flow Imbalance (OFI) Engine (Cont, Kukanov & Stoikov 2014)
// Tracks L2 order book microstructural imbalance and adjusts market maker reservation prices.

import type {
  L2OrderBookSnapshot,
  OfiConfig,
  GtmMarketMakerQuotes,
} from './gtm-types';
import type { GtmEngine } from './gtm-engine';

export class OfiEngine {
  private lastSnapshot?: L2OrderBookSnapshot;
  private readonly config: Required<OfiConfig>;

  constructor(config: OfiConfig) {
    if (config.beta < 0) {
      throw new Error('OFI beta parameter must be non-negative.');
    }
    this.config = {
      beta: config.beta,
      maxShiftRatio: config.maxShiftRatio ?? 0.02,
    };
  }

  /**
   * Computes single-period Order Flow Imbalance (OFI) between consecutive L2 snapshots.
   * OFI = Delta_Bid_Flow - Delta_Ask_Flow
   */
  computeOfi(current: L2OrderBookSnapshot): number {
    if (!this.lastSnapshot) {
      this.lastSnapshot = current;
      return 0;
    }

    const prev = this.lastSnapshot;
    this.lastSnapshot = current;

    // Bid order flow
    let deltaBid = 0;
    if (current.bid.price > prev.bid.price) {
      deltaBid = current.bid.size;
    } else if (current.bid.price === prev.bid.price) {
      deltaBid = current.bid.size - prev.bid.size;
    } else {
      deltaBid = -prev.bid.size;
    }

    // Ask order flow
    let deltaAsk = 0;
    if (current.ask.price > prev.ask.price) {
      deltaAsk = -prev.ask.size;
    } else if (current.ask.price === prev.ask.price) {
      deltaAsk = current.ask.size - prev.ask.size;
    } else {
      deltaAsk = current.ask.size;
    }

    return deltaBid - deltaAsk;
  }

  /**
   * Calculates quotes incorporating GTM inventory spreads and OFI directional price skew.
   */
  calculateQuotes(
    currentBook: L2OrderBookSnapshot,
    inventory: number,
    gtmEngine: GtmEngine,
  ): GtmMarketMakerQuotes {
    const ofi = this.computeOfi(currentBook);
    const midPrice = (currentBook.bid.price + currentBook.ask.price) / 2;

    const maxShift = midPrice * this.config.maxShiftRatio;
    const rawShift = ofi * this.config.beta;
    const ofiAdjustment = Math.max(-maxShift, Math.min(maxShift, rawShift));

    const reservationPrice = midPrice + ofiAdjustment;
    const spreads = gtmEngine.computeOptimalSpreads(inventory);

    return {
      midPrice,
      reservationPrice,
      ofiAdjustment,
      bidPrice: reservationPrice - spreads.deltaBid,
      askPrice: reservationPrice + spreads.deltaAsk,
      spreads,
    };
  }

  reset(): void {
    this.lastSnapshot = undefined;
  }
}
