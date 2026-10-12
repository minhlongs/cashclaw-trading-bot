import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';

export function buildAdjacency(hypotheses: readonly ResearchHypothesis[]) {
  const parentOf = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  for (const h of hypotheses) {
    if (parentOf.has(h.id)) throw new Error(`lineage build failed: duplicate hypothesis id '${h.id}'`);
    parentOf.set(h.id, h.parentHypothesisId);
    if (!children.has(h.id)) children.set(h.id, []);
  }
  for (const h of hypotheses) {
    if (h.parentHypothesisId === null) continue;
    const s = children.get(h.parentHypothesisId);
    if (s) s.push(h.id); else children.set(h.parentHypothesisId, [h.id]);
  }
  for (const id of parentOf.keys()) {
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && parentOf.has(cursor)) {
      if (visited.has(cursor)) throw new Error(`lineage cycle detected involving hypothesis '${cursor}'`);
      visited.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return { parentOf, children };
}
