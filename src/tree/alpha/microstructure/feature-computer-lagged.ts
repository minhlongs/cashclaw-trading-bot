// Causal feature computer: lagged microstructure metrics.
// Pure: no I/O, no Date.now(), no randomness.

import { PUBLICATION_LAG_SNAPSHOTS, midPrice } from './feature-math';
import type { ValidatedSnapshot } from './types';

/**
 * Features 8-9: need the next snapshot's mid; published one snapshot late.
 *
 * @param series validated snapshots in ascending timestamp order.
 * @param index  current snapshot index within the series.
 * @param asOf   wall clock (ms epoch); lagged features require the future
 *               snapshot's timestamp to be <= asOf.
 * @param spread instant bid-ask spread for this snapshot.
 * @param volumeDelta net signed volume delta for this snapshot.
 */
export function computeLaggedFeatures(
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
