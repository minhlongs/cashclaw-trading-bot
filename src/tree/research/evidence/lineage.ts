// ResearchLineage — parent/children graph over ResearchHypothesis.parentHypothesisId.
// Pure logic, no I/O. Cycle detection is fail-closed (throws). The
// falsified-spawn guard mirrors queue/validation.ts registry-collision
// logic: implicit re-tests of dead hypotheses are rejected.

import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';

/** Parent/children graph with traversal helpers. */
export interface ResearchLineage {
  /** hypothesis id → parent id (null when root). */
  readonly parentOf: ReadonlyMap<string, string | null>;
  /** hypothesis id → direct children ids. */
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  /** Ancestor chain from nearest parent upward. */
  ancestorsOf(id: string): readonly string[];
  /** All descendants (BFS order, nearest first). */
  descendantsOf(id: string): readonly string[];
}

/** Outcome of the falsified-spawn guard. */
export type SpawnGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Build the lineage graph. Throws on a parent cycle (fail-closed) —
 * a cycle means corrupted lineage and no traversal may proceed.
 * Duplicate hypothesis ids also throw: lineage must be unambiguous.
 */
export function buildLineage(hypotheses: readonly ResearchHypothesis[]): ResearchLineage {
  const parentOf = new Map<string, string | null>();
  const children = new Map<string, string[]>();

  for (const h of hypotheses) {
    if (parentOf.has(h.id)) {
      throw new Error(`lineage build failed: duplicate hypothesis id '${h.id}'`);
    }
    parentOf.set(h.id, h.parentHypothesisId);
    if (!children.has(h.id)) children.set(h.id, []);
  }

  for (const h of hypotheses) {
    if (h.parentHypothesisId === null) continue;
    const siblings = children.get(h.parentHypothesisId);
    if (siblings) siblings.push(h.id);
    else children.set(h.parentHypothesisId, [h.id]);
  }

  // Cycle detection: walk each node's parent chain; revisiting a node = cycle.
  for (const id of parentOf.keys()) {
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && parentOf.has(cursor)) {
      if (visited.has(cursor)) {
        throw new Error(`lineage cycle detected involving hypothesis '${cursor}'`);
      }
      visited.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  return {
    parentOf,
    childrenOf: children,
    ancestorsOf: (start: string): readonly string[] => {
      const chain: string[] = [];
      let cursor = parentOf.get(start) ?? null;
      while (cursor !== null) {
        chain.push(cursor);
        cursor = parentOf.get(cursor) ?? null;
      }
      return chain;
    },
    descendantsOf: (start: string): readonly string[] => {
      const out: string[] = [];
      const queue: string[] = [...(children.get(start) ?? [])];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        out.push(next);
        queue.push(...(children.get(next) ?? []));
      }
      return out;
    },
  };
}

/**
 * Guard for spawning a child from a FALSIFIED parent. Fail-closed:
 * a falsified hypothesis may spawn a new hypothesis ONLY when the child
 * explicitly sets parentHypothesisId to the parent AND provides a
 * non-empty mutation rationale. Implicit re-tests are rejected —
 * "do not retest dead hypotheses" (mirrors queue registry-collision).
 */
export function spawnFromFalsified(
  parent: ResearchHypothesis,
  child: ResearchHypothesis,
  mutationRationale: string,
): SpawnGuardResult {
  const reasons: string[] = [];

  if (child.parentHypothesisId !== parent.id) {
    reasons.push(
      `implicit re-test of falsified hypothesis '${parent.id}' rejected: child must explicitly set parentHypothesisId`,
    );
  }
  if (mutationRationale.trim() === '') {
    reasons.push(
      `spawning from falsified hypothesis '${parent.id}' requires a non-empty mutation rationale`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}
