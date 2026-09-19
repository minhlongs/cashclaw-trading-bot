// Causal feature computer: instant (lag-0) microstructure metrics.
// Pure: no I/O, no Date.now(), no randomness.

import {
  LIQUIDITY_SHOCK_WINDOW,
  sumQuantities,
  visibleDepth,
  zScore,
} from './feature-math';
import type { DepthPayload } from './snapshot-types';
import type { AggregatedTrades, ValidatedSnapshot } from './types';

export interface OrderbookFeatures {
  spread: number | null;
  orderBookImbalance: number | null;
  depthImbalance: number | null;
}

export interface TradeFeatures {
  tradeImbalance: number | null;
  aggressiveVolume: number | null;
  volumeDelta: number | null;
}

/** Features 1-3: instant orderbook features from a single snapshot. */
export function computeOrderbookFeatures(depth: DepthPayload): OrderbookFeatures {
  const bestBid = depth.bids[0];
  const bestAsk = depth.asks[0];

  // 1. bid_ask_spread = best_ask - best_bid (null if crossed or missing).
  const spread =
    bestBid && bestAsk && bestAsk.price > bestBid.price
      ? bestAsk.price - bestBid.price
      : null;

  // 2. order_book_imbalance on the best quotes (null if total qty is 0).
  let orderBookImbalance: number | null = null;
  if (bestBid && bestAsk) {
    const total = bestBid.quantity + bestAsk.quantity;
    if (total > 0) {
      orderBookImbalance = (bestBid.quantity - bestAsk.quantity) / total;
    }
  }

  // 3. depth_imbalance across all stored levels.
  let depthImbalance: number | null = null;
  const bidDepth = sumQuantities(depth.bids);
  const askDepth = sumQuantities(depth.asks);
  if (bidDepth + askDepth > 0) {
    depthImbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
  }

  return { spread, orderBookImbalance, depthImbalance };
}

/** Features 4-6: trade-window features; null when the batch is incomplete. */
export function computeTradeFeatures(trades: AggregatedTrades | null): TradeFeatures {
  if (trades === null || !trades.complete) {
    return { tradeImbalance: null, aggressiveVolume: null, volumeDelta: null };
  }
  const totalVol = trades.buyVolume + trades.sellVolume;
  return {
    tradeImbalance:
      totalVol > 0 ? (trades.buyVolume - trades.sellVolume) / totalVol : null,
    // Aggressive notional flow: buy + sell (convention per contract comment).
    aggressiveVolume: totalVol,
    volumeDelta: trades.buyVolume - trades.sellVolume,
  };
}

/** Feature 7: z-score of visible depth vs the prior k snapshots. */
export function computeLiquidityShock(
  series: readonly ValidatedSnapshot[],
  index: number,
): number | null {
  const priorDepths: number[] = [];
  for (let j = Math.max(0, index - LIQUIDITY_SHOCK_WINDOW); j < index; j++) {
    priorDepths.push(visibleDepth(series[j].depth));
  }
  if (priorDepths.length !== LIQUIDITY_SHOCK_WINDOW) return null; // no fill
  return zScore(visibleDepth(series[index].depth), priorDepths);
}
