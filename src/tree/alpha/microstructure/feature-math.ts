// Pure math helpers for microstructure feature computation.
// No state, no I/O — shared by feature-computer.ts only.

import { MICROSTRUCTURE_FEATURE_NAMES } from './contracts';
import type { DepthPayload } from './snapshot-types';

/** Rolling window (in prior snapshots) for the liquidity_shock z-score. */
export const LIQUIDITY_SHOCK_WINDOW = 12;

/** Publication lag in snapshots for realized_spread and price_impact (h = 1). */
export const PUBLICATION_LAG_SNAPSHOTS = 1;

/** Mid price of the best quotes; null when crossed/locked or missing. */
export function midPrice(depth: DepthPayload): number | null {
  const bestBid = depth.bids[0]?.price;
  const bestAsk = depth.asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) return null;
  if (bestBid >= bestAsk) return null;
  return (bestBid + bestAsk) / 2;
}

/** Total visible quantity across all stored levels of both sides. */
export function visibleDepth(depth: DepthPayload): number {
  let total = 0;
  for (const level of depth.bids) total += level.quantity;
  for (const level of depth.asks) total += level.quantity;
  return total;
}

export function sumQuantities(levels: ReadonlyArray<{ quantity: number }>): number {
  let total = 0;
  for (const level of levels) total += level.quantity;
  return total;
}

/** A feature set with every declared slot null (asOf gate / missing input). */
export function nullFeatureSet(): Record<string, number | null> {
  const features: Record<string, number | null> = {};
  for (const name of MICROSTRUCTURE_FEATURE_NAMES) {
    features[name] = null;
  }
  return features;
}

/** z-score of value against a sample; null when the sample is degenerate. */
export function zScore(value: number, sample: number[]): number | null {
  const n = sample.length;
  if (n === 0) return null;
  let mean = 0;
  for (const v of sample) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of sample) variance += (v - mean) * (v - mean);
  variance /= n;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null; // constant history — shock magnitude undefined
  return (value - mean) / sd;
}
