// DecisionProposal — canonical contract for a deliberation-layer proposal.
// Pure types + Zod validation; no I/O, no LLM, no order surface.
// Fail-closed: parseDecisionProposal collects ALL Zod issues and never
// returns a partial object. proposedEntry/Exit/Stop are RESEARCH CLAIMS
// (strings/numbers to falsify), never order objects — the schema has no
// orderId/exchange/side:market field, so no order can be constructed here.

import { z } from 'zod';
import {
  type AgentProvenance,
  PROPOSAL_DIRECTIONS,
  type ModelProvenance,
} from './types';

const isoDateTime = z.string().datetime({ offset: true });

/** One evidence item backing a proposal (claim + source). */
export interface EvidenceItem {
  readonly claim: string;
  readonly source: string;
}

/** One data provenance record: where a piece of input data came from. */
export interface DataProvenanceItem {
  readonly dataset: string;
  readonly provider: string;
  readonly timestamp: string;
}

/** Canonical decision proposal (task §A). Exactly 20 fields, all Zod-validated. */
export interface DecisionProposal {
  readonly proposalId: string;
  readonly researchGoalId: string;
  readonly thesis: string;
  readonly counterThesis: string;
  readonly evidence: readonly EvidenceItem[];
  readonly assumptions: readonly string[];
  readonly invalidationConditions: readonly string[];
  readonly catalyst: readonly string[];
  readonly horizon: number;
  readonly confidence: number;
  readonly proposedDirection: string;
  readonly proposedPosition: number;
  readonly proposedEntry: string;
  readonly proposedExit: string;
  readonly proposedStop: string;
  readonly riskFactors: readonly string[];
  readonly dataProvenance: readonly DataProvenanceItem[];
  readonly agentProvenance: AgentProvenance;
  readonly modelProvenance: ModelProvenance;
  readonly createdAt: string;
}

const evidenceItemSchema = z.object({
  claim: z.string().min(1),
  source: z.string().min(1),
});

const dataProvenanceSchema = z.object({
  dataset: z.string().min(1),
  provider: z.string().min(1),
  timestamp: isoDateTime,
});

const agentProvenanceSchema = z.object({
  agentRole: z.string().min(1),
  agentId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});

const modelProvenanceSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  tier: z.string().min(1),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

/** Zod schema for DecisionProposal (EXACTLY the 20 fields of §A). */
export const decisionProposalSchema = z.object({
  proposalId: z.string().min(1),
  researchGoalId: z.string().min(1),
  thesis: z.string().min(1),
  counterThesis: z.string().min(1),
  evidence: z.array(evidenceItemSchema).min(1),
  assumptions: z.array(z.string().min(1)).min(1),
  invalidationConditions: z.array(z.string().min(1)).min(1),
  catalyst: z.array(z.string().min(1)).min(1),
  horizon: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  proposedDirection: z.enum(PROPOSAL_DIRECTIONS),
  proposedPosition: z.number().finite(),
  proposedEntry: z.string().min(1),
  proposedExit: z.string().min(1),
  proposedStop: z.string().min(1),
  riskFactors: z.array(z.string().min(1)).min(1),
  dataProvenance: z.array(dataProvenanceSchema).min(1),
  agentProvenance: agentProvenanceSchema,
  modelProvenance: modelProvenanceSchema,
  createdAt: isoDateTime,
});

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseDecisionProposalResult =
  | { readonly ok: true; readonly value: DecisionProposal }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** A proposal that explicitly carries no order surface. */
export const NO_ORDER_FIELDS = ['orderId', 'exchange', 'side', 'market', 'quantity', 'leverage'] as const;

/**
 * Parse unknown input into a DecisionProposal. Fail-closed: every Zod
 * issue is collected, so a malformed input can never yield a partial
 * object. Also rejects any input carrying an order field (§L: Debate →
 * Trade is forbidden by construction).
 */
export function parseDecisionProposal(input: unknown): ParseDecisionProposalResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reasons: ['decision proposal: input must be a non-null object'] };
  }
  const obj = input as Record<string, unknown>;
  for (const f of NO_ORDER_FIELDS) {
    if (f in obj) {
      return {
        ok: false,
        reasons: [`decision proposal: order field '${f}' is forbidden (Debate → Trade is not allowed)`],
      };
    }
  }

  const parsed = decisionProposalSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }
  return { ok: true, value: parsed.data as DecisionProposal };
}