// DecisionProposal — canonical contract for a deliberation-layer proposal.
// Pure types + Zod validation; no I/O, no LLM, no order surface.
// Fail-closed: parseDecisionProposal collects ALL Zod issues and never
// returns a partial object. proposedEntry/Exit/Stop are RESEARCH CLAIMS
// (strings/numbers to falsify), never order objects — the schema has no
// orderId/exchange/side:market field, so no order can be constructed here.
// Schemas/interfaces live in decision-contract-schemas.ts.

import { decisionProposalSchema, type DecisionProposal } from './decision-contract-schemas';

export {
  type DataProvenanceItem,
  type DecisionProposal,
  type EvidenceItem,
  decisionProposalSchema,
} from './decision-contract-schemas';

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
