// TradingAgents deliberation layer — shared enum + provenance types.
// Pure types only: no I/O, no LLM, no eval. Deterministic.
// Provenance records WHO produced WHAT, so untrusted agent output stays
// traceable to a specific role/model/provider/tool without any code path
// from LLM text to an order surface.

/** Role an agent plays inside the deliberation pipeline. */
export const AGENT_ROLES = [
  'analyst',
  'bull-researcher',
  'bear-researcher',
  'research-manager',
  'risk-advisor',
  'portfolio-advisor',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Model routing tier (task §F). */
export const MODEL_TIERS = ['FAST', 'REASONING', 'LOCAL'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Research proposal direction (reuses EXPECTED_DIRECTIONS semantics). */
export const PROPOSAL_DIRECTIONS = ['long', 'short', 'neutral'] as const;
export type ProposalDirection = (typeof PROPOSAL_DIRECTIONS)[number];

/** Verdict emitted by the debate quality harness (§J). */
export const DEBATE_VERDICTS = ['PASS', 'REDUCE', 'DISABLE', 'INCONCLUSIVE'] as const;
export type DebateVerdict = (typeof DEBATE_VERDICTS)[number];

/** Provider identity for an agent call. Provider ids are an allowlisted set
 * (task.md:43) — any unknown id is rejected by the security gate. */
export interface AgentProvenance {
  readonly agentRole: AgentRole;
  readonly agentId: string;
  readonly providerId: string;
  readonly modelId: string;
}

/** Per-call model provenance recorded by the tiered router (§F). */
export interface ModelProvenance {
  readonly providerId: string;
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly latencyMs?: number;
}

/** Tool provenance: every external tool call must be allowlisted. */
export interface ToolProvenance {
  readonly toolName: string;
  readonly allowlisted: boolean;
}