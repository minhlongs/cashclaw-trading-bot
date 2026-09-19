// Causal feature computer for the nine declared microstructure contracts.
// Pure function: no I/O, no Date.now(), no randomness.
//
// Publication lag: a feature value for timestamp t is emitted only when every
// input it needs has a timestamp <= asOf. Features 8/9 (realized_spread,
// price_impact) need the NEXT snapshot's mid, so they are emitted one
// snapshot late — at decision time tau a consumer only sees t <= tau - 1.
// Missing or insufficient input stays null; forward-filling is forbidden.

import { nullFeatureSet } from './feature-math';
import type { FeatureVector, ValidatedSnapshot } from './types';
import {
  computeOrderbookFeatures,
  computeTradeFeatures,
  computeLiquidityShock,
} from './feature-computer-instant';
import { computeLaggedFeatures } from './feature-computer-lagged';

export {
  computeOrderbookFeatures,
  computeTradeFeatures,
  computeLiquidityShock,
} from './feature-computer-instant';
export { computeLaggedFeatures } from './feature-computer-lagged';

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
