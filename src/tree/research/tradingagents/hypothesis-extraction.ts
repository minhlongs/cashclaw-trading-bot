// Hypothesis extraction — turn a bull/bear debate into two falsifiable
// ResearchHypothesis objects (task §B). Pure logic: no I/O, no LLM, no
// winner selection. Bull → Hypothesis A, Bear → Hypothesis B; BOTH are fed
// to CashClaw's experiment/OOS/cost pipeline. Which survives is decided by
// evidence downstream, never by which debater was more persuasive (§B, §L).
// Deterministic ids via FNV-1a32 over canonical(debateState+role) — no wall
// clock. Reuses parseResearchHypothesis (Zod + mechanism gate).

import { canonicalize } from '@/lib/canonical-json';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import {
  parseResearchHypothesis,
  type ExpectedDirection,
  type FeatureRef,
  type ResearchHypothesis,
} from '@/tree/research/hypothesis/types';

/** One side's debate thesis (bull or bear). */
export interface DebateThesis {
  readonly role: 'bull' | 'bear';
  readonly thesis: string;
  /** Causal mechanism claim — must pass the mechanism gate. */
  readonly mechanism: string;
  readonly evidence: readonly string[];
  readonly expectedDirection: ExpectedDirection;
  readonly horizon: number;
  readonly features: readonly FeatureRef[];
}

/** A bull/bear debate bound to a research goal. */
export interface DebateInput {
  readonly goalId: string;
  readonly bull: DebateThesis;
  readonly bear: DebateThesis;
}

/** Config injected by the caller (no wall clock unless provided). */
export interface HypothesisExtractionConfig {
  readonly universe: Universe;
  readonly timeframe: string;
  readonly nowIso: string;
  readonly importerVersion: string;
  readonly defaultCostMode: StressMode;
}

/** The two extracted hypotheses (A = bull, B = bear). */
export interface ExtractedHypotheses {
  readonly hypothesisA: ResearchHypothesis;
  readonly hypothesisB: ResearchHypothesis;
}

/** Extraction outcome: fail-closed, never partial. */
export type ExtractHypothesesResult =
  | { readonly ok: true; readonly value: ExtractedHypotheses }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** FNV-1a32 hash — deterministic, no crypto needed for ids. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic hypothesis id from canonical(debateState + role). */
export function buildHypothesisId(goalId: string, thesis: DebateThesis): string {
  const payload = canonicalize({ goalId, role: thesis.role, thesis: thesis.thesis });
  return `delib-${thesis.role}-${fnv1a32(payload).toString(16).padStart(8, '0')}`;
}

/** Assemble one ResearchHypothesis candidate from a debate thesis. */
function buildHypothesis(
  thesis: DebateThesis,
  debate: DebateInput,
  config: HypothesisExtractionConfig,
): ResearchHypothesis {
  const lookback = thesis.features.length > 0 ? thesis.features[0].lookback : 1;
  return {
    id: buildHypothesisId(debate.goalId, thesis),
    title: `${thesis.role === 'bull' ? 'Bull' : 'Bear'} case: ${thesis.thesis.slice(0, 60)}`,
    description: thesis.thesis,
    rationale: `Debate ${thesis.role} side evidence: ${thesis.evidence.join('; ')}`,
    source: 'deliberation',
    parentHypothesisId: null,
    universe: config.universe,
    timeframe: config.timeframe,
    horizon: thesis.horizon,
    features: thesis.features,
    transformations: [],
    regimeConstraints: [],
    expectedMechanism: thesis.mechanism,
    expectedDirection: thesis.expectedDirection,
    expectedHoldingPeriod: Math.max(thesis.horizon, lookback),
    costAssumption: config.defaultCostMode,
    generatedBy: config.importerVersion,
    createdAt: config.nowIso,
    experimentVersion: 1,
  };
}

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
      hypothesisA: (bullParsed as { ok: true; value: ResearchHypothesis }).value,
      hypothesisB: (bearParsed as { ok: true; value: ResearchHypothesis }).value,
    },
  };
}