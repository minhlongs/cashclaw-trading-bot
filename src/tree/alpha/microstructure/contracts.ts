// Microstructure feature declarations (mission §3A).
// Contracts only — no data fetching, no I/O, no Node APIs (Cloudflare Workers safe).
// Every feature is registered through the existing declareFeature() gate so the
// causal/non-causal check is enforced by the shared contract, not reinvented.

import { declareFeature, type FeatureDeclaration } from '@/tree/alpha/indicator-types';

/**
 * Build a microstructure feature declaration. Source is always orderbook or
 * trades, availability is always when_listed (the feature exists only while
 * the symbol is listed on the venue), and causal is always true.
 *
 * @param name snake_case feature name (must match a declared feature).
 * @param source where the raw inputs come from.
 * @param lookback number of lookback units required for a valid computation.
 *   1 = the current snapshot/instant only (most microstructure features are
 *   instantaneous); larger values denote rolling windows over prior snapshots.
 */
function microstructureDeclaration(
  name: string,
  source: FeatureDeclaration['source'],
  lookback: number,
): FeatureDeclaration {
  return declareFeature({
    name,
    timeframe: '1m',
    source,
    lookback,
    availability: 'when_listed',
    causal: true,
  });
}

/** The nine declared microstructure features, in declaration order. */
export const MICROSTRUCTURE_FEATURES: readonly FeatureDeclaration[] = [
  // ── Orderbook source ──────────────────────────────────────────────────────
  // Spread between the best bid and best ask (instantaneous).
  microstructureDeclaration('bid_ask_spread', 'orderbook', 1),
  // (best_bid_qty - best_ask_qty) / (best_bid_qty + best_ask_qty).
  microstructureDeclaration('order_book_imbalance', 'orderbook', 1),
  // Depth imbalance across the visible book (sum of N levels each side).
  microstructureDeclaration('depth_imbalance', 'orderbook', 1),
  // (taker_buy_volume - taker_sell_volume) over the lookback window.
  microstructureDeclaration('trade_imbalance', 'trades', 1),
  // Notional volume that crossed the spread in the buyer- or seller-initiated
  // direction, separated by aggressor side.
  microstructureDeclaration('aggressive_volume', 'trades', 1),
  // Net volume delta (aggressive buy - aggressive sell) over the window.
  microstructureDeclaration('volume_delta', 'trades', 1),
  // A sudden, abnormal change in the visible book depth relative to its recent
  // history — a liquidity shock event.
  microstructureDeclaration('liquidity_shock', 'orderbook', 1),
  // (mid_price_after_trade - mid_price_before_trade) minus the spread, i.e. the
  // component of the trade move that the spread does not explain.
  microstructureDeclaration('realized_spread', 'orderbook', 1),
  // Short-horizon price impact: mid-price displacement over the next few bars
  // relative to the trade that caused it.
  microstructureDeclaration('price_impact', 'orderbook', 1),
] as const;

/** Names of all declared microstructure features, keyed by declaration. */
export const MICROSTRUCTURE_FEATURE_NAMES: readonly string[] =
  MICROSTRUCTURE_FEATURES.map(f => f.name);

/** Look up a declared feature by name; throws if undeclared. */
export function getMicrostructureFeature(name: string): FeatureDeclaration {
  const found = MICROSTRUCTURE_FEATURES.find(f => f.name === name);
  if (!found) {
    throw new Error(`microstructure feature '${name}' is not declared`);
  }
  return found;
}