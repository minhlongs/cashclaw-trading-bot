// ResearchSynthesis — the research-manager output (task §C).
// Pure types + Zod validation; no I/O, no LLM. A synthesis summarizes the
// debate into a falsifiable research statement. It CANNOT approve trading:
// the schema has no approve/trade/order field, and parse rejects any input
// that tries to smuggle one in. Approval is a human-only, downstream act.

import { z } from 'zod';

/** One falsifiable assumption the synthesis rests on. */
export interface FalsifiableAssumption {
  readonly statement: string;
  readonly howToFalsify: string;
}

/** One proposed experiment to test an assumption. */
export interface ProposedExperiment {
  readonly hypothesisRef: string;
  readonly method: string;
}

/** Research-manager synthesis (task §C). Advisory research only. */
export interface ResearchSynthesis {
  readonly thesis: string;
  readonly strongestEvidence: string;
  readonly strongestCounterEvidence: string;
  readonly unresolvedUncertainty: string;
  readonly falsifiableAssumptions: readonly FalsifiableAssumption[];
  readonly proposedExperiments: readonly ProposedExperiment[];
}

/** Fields that would turn a synthesis into an approval — all forbidden. */
export const FORBIDDEN_APPROVAL_FIELDS = [
  'approved',
  'approve',
  'approval',
  'trade',
  'execute',
  'order',
  'goAhead',
] as const;

const falsifiableAssumptionSchema = z.object({
  statement: z.string().min(1),
  howToFalsify: z.string().min(1),
});

const proposedExperimentSchema = z.object({
  hypothesisRef: z.string().min(1),
  method: z.string().min(1),
});

/** Zod schema for ResearchSynthesis (exactly the 6 fields of §C). */
export const researchSynthesisSchema = z.object({
  thesis: z.string().min(1),
  strongestEvidence: z.string().min(1),
  strongestCounterEvidence: z.string().min(1),
  unresolvedUncertainty: z.string().min(1),
  falsifiableAssumptions: z.array(falsifiableAssumptionSchema).min(1),
  proposedExperiments: z.array(proposedExperimentSchema).min(1),
});

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseResearchSynthesisResult =
  | { readonly ok: true; readonly value: ResearchSynthesis }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Parse unknown input into a ResearchSynthesis. Fail-closed. Also rejects
 * any input carrying an approval/trade field — a synthesis may summarize
 * research but must never approve or place a trade (§C, §L).
 */
export function parseResearchSynthesis(input: unknown): ParseResearchSynthesisResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reasons: ['research synthesis: input must be a non-null object'] };
  }
  const obj = input as Record<string, unknown>;
  for (const f of FORBIDDEN_APPROVAL_FIELDS) {
    if (f in obj) {
      return {
        ok: false,
        reasons: [`research synthesis: approval field '${f}' is forbidden (synthesis cannot approve trading)`],
      };
    }
  }

  const parsed = researchSynthesisSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }
  return { ok: true, value: parsed.data as ResearchSynthesis };
}