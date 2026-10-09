import type { HypothesisProposal } from './types';
import { matchFalsified } from './agent-validation-matcher';
import { FalsificationGuardError } from './agent-errors';

export function filterSafeHypotheses(
  proposals: readonly HypothesisProposal[],
  falsifiedClassesToExclude: readonly string[],
  strictFalsificationBlock?: boolean,
): readonly HypothesisProposal[] {
  const excludedIds = new Set(falsifiedClassesToExclude.map((s) => s.toLowerCase()));
  const safe: HypothesisProposal[] = [];
  for (const proposal of proposals) {
    const match = matchFalsified(proposal, excludedIds);
    if (match) {
      if (strictFalsificationBlock) {
        throw new FalsificationGuardError(`Hypothesis '${proposal.title}' replicates falsified class '${match}' and is blocked.`);
      }
      continue;
    }
    safe.push(proposal);
  }
  if (safe.length === 0 && proposals.length > 0 && strictFalsificationBlock) {
    throw new FalsificationGuardError('All proposed hypotheses replicate falsified classes.');
  }
  return safe;
}
