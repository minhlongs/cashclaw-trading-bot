/**
 * Single-alpha scoring — deterministic net-edge formula and input validation.
 *
 * net_edge formula (pure function of inputs x config weights — no fit):
 *   net_edge = returnWeight * confidence * expectedReturn
 *            - costWeight * expectedCost
 *            - riskPenaltyWeight * (1 - confidence)
 *            - turnoverPenaltyWeight * expectedTurnover
 *
 * Note: `confidenceWeight` exists on CompositionWeights but is intentionally
 * NOT applied inside net_edge — it is consumed downstream by portfolio sizing.
 * Keeping it out preserves the exact Mission §6 formula above.
 *
 * Fail-closed contract (no silent defaults):
 *   - Non-finite numeric field (NaN/Infinity) -> {score:null, reason}.
 *   - direction 'hold'                        -> {score:0, reason}. Holds carry
 *     no directional edge so they rank below any profitable buy/sell, yet stay
 *     distinguishable from rejected (invalid) alphas via `reason`.
 */

import type { ComposedAlpha, CompositionConfig } from './types';

const VALID_DIRECTIONS: ReadonlySet<string> = new Set(['buy', 'sell', 'hold']);

/**
 * Score result — discriminated union on `score`:
 *   {score: number}       -> valid alpha (`reason` present for holds)
 *   {score: null, reason} -> rejected alpha (fail-closed)
 */
export type AlphaScore =
  | { readonly score: number; readonly reason?: string }
  | { readonly score: null; readonly reason: string };

/** Validate direction/numeric sanity at the module boundary. */
function rejectReason(alpha: ComposedAlpha): string | null {
  if (!VALID_DIRECTIONS.has(alpha.direction)) {
    return `invalid direction: ${String(alpha.direction)}`;
  }
  if (!Number.isFinite(alpha.confidence)) {
    return `non-finite confidence: ${String(alpha.confidence)}`;
  }
  if (!Number.isFinite(alpha.expectedReturn)) {
    return `non-finite expectedReturn: ${String(alpha.expectedReturn)}`;
  }
  if (!Number.isFinite(alpha.expectedCost)) {
    return `non-finite expectedCost: ${String(alpha.expectedCost)}`;
  }
  if (!Number.isFinite(alpha.expectedTurnover)) {
    return `non-finite expectedTurnover: ${String(alpha.expectedTurnover)}`;
  }
  return null;
}

/** Deterministically score one composed alpha. */
export function scoreAlpha(
  alpha: ComposedAlpha,
  config: CompositionConfig,
): AlphaScore {
  const rejection = rejectReason(alpha);
  if (rejection !== null) {
    return { score: null, reason: rejection };
  }

  if (alpha.direction === 'hold') {
    return { score: 0, reason: 'hold direction carries no edge' };
  }

  const w = config.weights;
  const netEdge =
    w.returnWeight * alpha.confidence * alpha.expectedReturn -
    w.costWeight * alpha.expectedCost -
    w.riskPenaltyWeight * (1 - alpha.confidence) -
    w.turnoverPenaltyWeight * alpha.expectedTurnover;

  return { score: netEdge };
}
