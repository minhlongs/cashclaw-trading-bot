import { checkMechanism } from './mechanism-gate';
import type { ResearchHypothesis } from './hypothesis-contracts';
import { researchHypothesisSchema } from './hypothesis-schema';

export type ParseResearchHypothesisResult =
  | { readonly ok: true; readonly value: ResearchHypothesis }
  | { readonly ok: false; readonly reasons: readonly string[] };

export function parseResearchHypothesis(input: unknown): ParseResearchHypothesisResult {
  const parsed = researchHypothesisSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }
  const mechanism = checkMechanism(parsed.data.expectedMechanism);
  if (!mechanism.ok) {
    return { ok: false, reasons: mechanism.reasons };
  }
  return { ok: true, value: parsed.data as ResearchHypothesis };
}
