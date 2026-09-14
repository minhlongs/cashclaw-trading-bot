// Debate Orchestrator Types — domain types, configurations, and schema parsers.

import type { ModelRouter } from './model-router';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';

/** Configuration for the debate orchestrator. */
export interface DebateOrchestratorConfig {
  readonly router: ModelRouter;
  readonly maxDebateRounds: number;
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly nowIso: string;
}

/** Structured bull/bear side parsed from the LLM JSON response. */
export interface DebateSide {
  readonly role: 'bull-researcher' | 'bear-researcher';
  readonly thesis: string;
  readonly mechanism: string;
  readonly evidence: readonly string[];
  readonly expectedDirection: 'long' | 'short' | 'neutral';
  readonly horizon: number;
  readonly features: readonly string[];
}

/** Full orchestrator output. */
export interface OrchestratorResult {
  readonly decisionProposal: DecisionProposal;
  readonly debateState: DebateState;
  readonly bull: DebateSide;
  readonly bear: DebateSide;
  readonly modelProvenance: readonly ModelProvenanceRecord[];
  readonly toolProvenance: readonly ToolProvenance[];
}

/**
 * Parse the LLM JSON response into a structured DebateSide.
 * Fail-closed: returns null if the JSON is missing required fields.
 */
export function parseDebateSide(
  role: 'bull-researcher' | 'bear-researcher',
  text: string,
): DebateSide | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.thesis !== 'string' || typeof o.mechanism !== 'string') return null;
  if (!Array.isArray(o.evidence) || !o.evidence.every((e) => typeof e === 'string')) return null;
  if (typeof o.horizon !== 'number' || !Number.isFinite(o.horizon)) return null;
  if (!Array.isArray(o.features) || !o.features.every((f) => typeof f === 'string')) return null;
  const dir = o.expectedDirection;
  if (dir !== 'long' && dir !== 'short' && dir !== 'neutral') return null;
  return {
    role,
    thesis: o.thesis,
    mechanism: o.mechanism,
    evidence: o.evidence as string[],
    expectedDirection: dir,
    horizon: o.horizon,
    features: o.features as string[],
  };
}
