/**
 * Deterministic scoring for composed alphas.
 *
 * Re-exports single-alpha scoring and provides batch composition scoring,
 * turnover gating, and deterministic tie-breaking sort.
 */

import type { ComposedAlpha, CompositionConfig } from './types';
import { scoreAlpha, type AlphaScore } from './scoring-single';

export { scoreAlpha, type AlphaScore };

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
