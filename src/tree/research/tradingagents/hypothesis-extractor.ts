// Hypothesis extractor — validates bull & bear candidates via parseResearchHypothesis.
// Fail-closed: if either fails, ALL reasons are collected and nothing is returned.

import {
  parseResearchHypothesis,
  type ResearchHypothesis,
} from '@/tree/research/hypothesis/types';
import { buildHypothesis, type DebateInput, type HypothesisExtractionConfig } from './hypothesis-builder';

/** The two extracted hypotheses (A = bull, B = bear). */
export interface ExtractedHypotheses {
  readonly hypothesisA: ResearchHypothesis;
  readonly hypothesisB: ResearchHypothesis;
}

/** Extraction outcome: fail-closed, never partial. */
export type ExtractHypothesesResult =
  | { readonly ok: true; readonly value: ExtractedHypotheses }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Extract Hypothesis A (bull) + Hypothesis B (bear) from a debate. Both are
 * validated via parseResearchHypothesis (Zod + mechanism gate). Fail-closed:
 * if either fails, ALL reasons are collected and nothing is returned partial.
 * No winner is selected — both hypotheses proceed to evidence-based testing.
 */
export function extractHypotheses(
  debate: DebateInput,
  config: HypothesisExtractionConfig,
): ExtractHypothesesResult {
  const reasons: string[] = [];

  const bullCandidate = buildHypothesis(debate.bull, debate, config);
  const bullParsed = parseResearchHypothesis(bullCandidate);
  if (!bullParsed.ok) {
    reasons.push(...bullParsed.reasons.map((r) => `hypothesisA(bull): ${r}`));
  }

  const bearCandidate = buildHypothesis(debate.bear, debate, config);
  const bearParsed = parseResearchHypothesis(bearCandidate);
  if (!bearParsed.ok) {
    reasons.push(...bearParsed.reasons.map((r) => `hypothesisB(bear): ${r}`));
  }

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    value: {
      hypothesisA: (bullParsed as { ok: true; value: ExtractedHypotheses['hypothesisA'] }).value,
      hypothesisB: (bearParsed as { ok: true; value: ExtractedHypotheses['hypothesisB'] }).value,
    },
  };
}
