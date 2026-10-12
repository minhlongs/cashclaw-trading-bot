import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { SpawnGuardResult } from './lineage-types';

export function spawnFromFalsified(
  parent: ResearchHypothesis,
  child: ResearchHypothesis,
  mutationRationale: string,
): SpawnGuardResult {
  const reasons: string[] = [];
  if (child.parentHypothesisId !== parent.id) {
    reasons.push(`implicit re-test of falsified hypothesis '${parent.id}' rejected: child must explicitly set parentHypothesisId`);
  }
  if (mutationRationale.trim() === '') {
    reasons.push(`spawning from falsified hypothesis '${parent.id}' requires a non-empty mutation rationale`);
  }
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true };
}
