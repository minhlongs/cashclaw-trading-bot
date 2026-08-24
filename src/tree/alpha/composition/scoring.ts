/**
 * Deterministic scoring for composed alphas.
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
 *
 * scoreComposedAlphas additionally enforces the config gates and surfaces
 * every drop explicitly in `rejected` (never swallowed):
 *   - expectedTurnover > maxTurnover -> rejected 'turnover above cap'
 *   - score < minNetEdge             -> rejected 'net edge below minimum'
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

/** An alpha that passed scoring and gates, with its net-edge score. */
export interface ScoredAlpha {
  readonly alpha: ComposedAlpha;
  readonly score: number;
}

/** An alpha removed from ranking, with the fail-closed reason. */
export interface RejectedAlpha {
  readonly alphaId: string;
  readonly reason: string;
}

export interface ScoreComposedResult {
  /** Survivors sorted by score descending (tie-break: alphaId ascending). */
  readonly scored: readonly ScoredAlpha[];
  /** Every filtered-out alpha with its reason — surfaced, never silent. */
  readonly rejected: readonly RejectedAlpha[];
}

/**
 * Score all alphas, enforce config gates, rank survivors deterministically:
 * score descending, ties broken by alphaId ascending so identical inputs
 * yield identical order (stable, no ambient state).
 */
export function scoreComposedAlphas(
  alphas: readonly ComposedAlpha[],
  config: CompositionConfig,
): ScoreComposedResult {
  const scored: ScoredAlpha[] = [];
  const rejected: RejectedAlpha[] = [];

  for (const alpha of alphas) {
    const result = scoreAlpha(alpha, config);
    if (result.score === null) {
      rejected.push({ alphaId: alpha.alphaId, reason: result.reason });
      continue;
    }
    if (alpha.expectedTurnover > config.maxTurnover) {
      rejected.push({ alphaId: alpha.alphaId, reason: 'turnover above cap' });
      continue;
    }
    if (result.score < config.minNetEdge) {
      rejected.push({ alphaId: alpha.alphaId, reason: 'net edge below minimum' });
      continue;
    }
    scored.push({ alpha, score: result.score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.alpha.alphaId !== b.alpha.alphaId) {
      return a.alpha.alphaId < b.alpha.alphaId ? -1 : 1;
    }
    return 0;
  });

  return { scored, rejected };
}
