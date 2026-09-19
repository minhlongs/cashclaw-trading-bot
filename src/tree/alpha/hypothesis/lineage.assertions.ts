// Hypothesis lineage — pure research-graph operations.
// ID scheme: H001 → H001-A → H001-A-REGIME → H001-A-REGIME-CROSSSECTIONAL.
// A child id must extend its parent id with a "-SEGMENT" suffix.

import type { HypothesisNode, HypothesisNodeStatus } from './lineage-types';

/** Root = H + 3 digits; each child appends -UPPERCASE-ALNUM segment. */
export const LINEAGE_ID_PATTERN = /^H\d{3}(?:-[A-Z][A-Z0-9]*)*$/;

/** Statuses that count as "not live" when evaluating dead ends. */
export const TERMINAL_STATUSES: ReadonlySet<HypothesisNodeStatus> = new Set([
  'FALSIFIED',
  'ARCHIVED',
]);

export function assertValidId(id: string, label: string): void {
  if (!LINEAGE_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid lineage ${label} id "${id}" (expected H### with -SEGMENT suffixes)`,
    );
  }
}

export function assertNotSelfParent(id: string, parentId: string): void {
  if (id === parentId) {
    throw new Error(`Node "${id}" cannot be its own parent`);
  }
}

export function assertChildPrefix(childId: string, parentId: string): void {
  if (!childId.startsWith(`${parentId}-`)) {
    throw new Error(
      `Child id "${childId}" must start with parent id "${parentId}-"`,
    );
  }
}

export function findNode(
  nodes: readonly HypothesisNode[],
  id: string,
): HypothesisNode | undefined {
  return nodes.find((node) => node.id === id);
}
