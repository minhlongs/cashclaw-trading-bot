// Causal feature computer for the nine declared microstructure contracts.
// Pure function: no I/O, no Date.now(), no randomness.
//
// Publication lag: a feature value for timestamp t is emitted only when every
// input it needs has a timestamp <= asOf. Features 8/9 (realized_spread,
// price_impact) need the NEXT snapshot's mid, so they are emitted one
// snapshot late — at decision time tau a consumer only sees t <= tau - 1.
// Missing or insufficient input stays null; forward-filling is forbidden.

import {
  LIQUIDITY_SHOCK_WINDOW,
  PUBLICATION_LAG_SNAPSHOTS,
  midPrice,
  nullFeatureSet,
  sumQuantities,
  visibleDepth,
  zScore,
} from './feature-math';
import type { DepthPayload } from './snapshot-types';
import type { AggregatedTrades, FeatureVector, ValidatedSnapshot } from './types';

/** Features 1-3: instant orderbook features from a single snapshot. */
function computeOrderbookFeatures(depth: DepthPayload): {
  spread: number | null;
  orderBookImbalance: number | null;
  depthImbalance: number | null;
} {
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
function computeTradeFeatures(trades: AggregatedTrades | null): {
  tradeImbalance: number | null;
  aggressiveVolume: number | null;
  volumeDelta: number | null;
} {
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
function computeLiquidityShock(
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

/** Features 8-9: need the next snapshot's mid; published one snapshot late. */
function computeLaggedFeatures(
  series: readonly ValidatedSnapshot[],
  index: number,
  asOf: number,
  spread: number | null,
  volumeDelta: number | null,
): { realizedSpread: number | null; priceImpact: number | null } {
  const next = series[index + PUBLICATION_LAG_SNAPSHOTS];
  if (next === undefined || next.timestamp > asOf) {
    return { realizedSpread: null, priceImpact: null };
  }
  const midBefore = midPrice(series[index].depth);
  const midAfter = midPrice(next.depth);
  if (midBefore === null || midAfter === null) {
    return { realizedSpread: null, priceImpact: null };
  }
  // 8. realized_spread = (mid_after - mid_before) - spread.
  const realizedSpread = spread !== null ? midAfter - midBefore - spread : null;
  // 9. price_impact = sign(delta) * (mid(t+h) - mid(t)) / mid(t), h = 1;
  //    null without a validated volume_delta for the aggressor side.
  let priceImpact: number | null = null;
  if (midBefore > 0 && volumeDelta !== null) {
    const sign = volumeDelta >= 0 ? 1 : -1;
    priceImpact = sign * ((midAfter - midBefore) / midBefore);
  }
  return { realizedSpread, priceImpact };
}

/**
 * Compute feature vectors for every snapshot in the series.
 *
 * Output keys are exactly MICROSTRUCTURE_FEATURE_NAMES for every vector;
 * a slot is null whenever its input is missing, incomplete, or its
 * publication window has not closed by `asOf`.
 *
 * @param series validated snapshots in ascending timestamp order.
 * @param asOf   wall clock (ms epoch); a feature needing data at time u is
 *               emitted only when u <= asOf.
 */
export function computeFeatureVectors(
  series: readonly ValidatedSnapshot[],
  asOf: number,
): FeatureVector[] {
  return series.map((snap, i) => computeOne(snap, series, i, asOf));
}

function computeOne(
  snap: ValidatedSnapshot,
  series: readonly ValidatedSnapshot[],
  index: number,
  asOf: number,
): FeatureVector {
  // asOf gate: nothing about timestamp t is knowable before t itself.
  // Instant features (lag 0) require asOf >= t; lagged features additionally
  // require the future snapshot's timestamp <= asOf (checked in the helper).
  if (snap.timestamp > asOf) {
    return { timestamp: snap.timestamp, symbol: snap.symbol, features: nullFeatureSet() };
  }

  const { spread, orderBookImbalance, depthImbalance } =
    computeOrderbookFeatures(snap.depth);
  const { tradeImbalance, aggressiveVolume, volumeDelta } =
    computeTradeFeatures(snap.trades);
  const liquidityShock = computeLiquidityShock(series, index);
  const { realizedSpread, priceImpact } = computeLaggedFeatures(
    series,
    index,
    asOf,
    spread,
    volumeDelta,
  );

  // Start from the all-null declared key set so the output keys are exactly
  // MICROSTRUCTURE_FEATURE_NAMES by construction — no extra, no missing slot.
  const features = nullFeatureSet();
  features['bid_ask_spread'] = spread;
  features['order_book_imbalance'] = orderBookImbalance;
  features['depth_imbalance'] = depthImbalance;
  features['trade_imbalance'] = tradeImbalance;
  features['aggressive_volume'] = aggressiveVolume;
  features['volume_delta'] = volumeDelta;
  features['liquidity_shock'] = liquidityShock;
  features['realized_spread'] = realizedSpread;
  features['price_impact'] = priceImpact;

  return { timestamp: snap.timestamp, symbol: snap.symbol, features };
}
