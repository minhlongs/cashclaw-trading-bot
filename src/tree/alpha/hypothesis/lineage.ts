// Hypothesis lineage — pure research-graph operations.
// ID scheme: H001 → H001-A → H001-A-REGIME → H001-A-REGIME-CROSSSECTIONAL.
// A child id must extend its parent id with a "-SEGMENT" suffix.

import type {
  HypothesisNode,
  HypothesisNodeStatus,
  RegistryBridgeEntry,
} from './lineage-types';

/** Root = H + 3 digits; each child appends -UPPERCASE-ALNUM segment. */
const LINEAGE_ID_PATTERN = /^H\d{3}(?:-[A-Z][A-Z0-9]*)*$/;

/** Statuses that count as "not live" when evaluating dead ends. */
const TERMINAL_STATUSES: ReadonlySet<HypothesisNodeStatus> = new Set([
  'FALSIFIED',
  'ARCHIVED',
]);

function assertValidId(id: string, label: string): void {
  if (!LINEAGE_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid lineage ${label} id "${id}" (expected H### with -SEGMENT suffixes)`,
    );
  }
}

function assertNotSelfParent(id: string, parentId: string): void {
  if (id === parentId) {
    throw new Error(`Node "${id}" cannot be its own parent`);
  }
}

function assertChildPrefix(childId: string, parentId: string): void {
  if (!childId.startsWith(`${parentId}-`)) {
    throw new Error(
      `Child id "${childId}" must start with parent id "${parentId}-"`,
    );
  }
}

function findNode(
  nodes: readonly HypothesisNode[],
  id: string,
): HypothesisNode | undefined {
  return nodes.find((node) => node.id === id);
}

/**
 * Create a single lineage node. Pure: caller supplies `createdAt`
 * (defaults to 0) and, when `parentId` is set, the current node set
 * so parent existence can be verified.
 */
export function createNode(
  id: string,
  parentId: string | null,
  mutation: string | null = null,
  evidence: readonly string[] = [],
  createdAt = 0,
  existingNodes: readonly HypothesisNode[] = [],
): HypothesisNode {
  assertValidId(id, 'node');
  if (parentId !== null) {
    assertValidId(parentId, 'parent');
    assertNotSelfParent(id, parentId);
    assertChildPrefix(id, parentId);
    if (findNode(existingNodes, parentId) === undefined) {
      throw new Error(`Parent "${parentId}" not found in lineage graph`);
    }
  }
  return { id, parentId, mutation, evidence, status: 'PROPOSED', createdAt };
}

/**
 * Append a child to the graph immutably. Rejects duplicate ids,
 * cycles, self-parents, missing parents, and invalid id prefixes.
 * Returns a NEW array; the input is never mutated.
 */
export function addChild(
  nodes: readonly HypothesisNode[],
  parentId: string,
  childId: string,
  mutation: string | null = null,
  evidence: readonly string[] = [],
  createdAt = 0,
): HypothesisNode[] {
  assertValidId(childId, 'child');
  assertNotSelfParent(childId, parentId);
  const existing = findNode(nodes, childId);
  if (existing !== undefined) {
    const wouldCycle = descendants(nodes, childId).some(
      (node) => node.id === parentId,
    );
    throw new Error(
      wouldCycle
        ? `Adding "${childId}" under "${parentId}" would create a cycle`
        : `Node "${childId}" already exists in lineage graph`,
    );
  }
  const child = createNode(childId, parentId, mutation, evidence, createdAt, nodes);
  return [...nodes, child];
}

/** All nodes reachable downward from `id` (excludes `id` itself). */
export function descendants(
  nodes: readonly HypothesisNode[],
  id: string,
): HypothesisNode[] {
  const result: HypothesisNode[] = [];
  const seen = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const node of nodes) {
      if (node.parentId !== null && frontier.has(node.parentId) && !seen.has(node.id)) {
        seen.add(node.id);
        result.push(node);
        next.add(node.id);
      }
    }
    frontier = next;
  }
  return result;
}

/** All nodes reachable upward from `id` (nearest parent first). */
export function ancestors(
  nodes: readonly HypothesisNode[],
  id: string,
): HypothesisNode[] {
  const result: HypothesisNode[] = [];
  const seen = new Set<string>();
  let current = findNode(nodes, id);
  while (current !== undefined && current.parentId !== null) {
    if (seen.has(current.parentId)) break;
    const parent = findNode(nodes, current.parentId);
    if (parent === undefined) break;
    seen.add(parent.id);
    result.push(parent);
    current = parent;
  }
  return result;
}

/**
 * A node is a dead end when it is FALSIFIED and has no live
 * (non-FALSIFIED, non-ARCHIVED) descendants.
 */
export function isDeadEnd(
  nodes: readonly HypothesisNode[],
  id: string,
): boolean {
  const node = findNode(nodes, id);
  if (node === undefined || node.status !== 'FALSIFIED') return false;
  return descendants(nodes, id).every((desc) => TERMINAL_STATUSES.has(desc.status));
}

/** Map a lineage node to the minimal registry bridge shape. */
export function lineageToRegistryEntries(node: HypothesisNode): RegistryBridgeEntry {
  return {
    hypothesisId: node.id,
    parentId: node.parentId,
    mutation: node.mutation,
  };
}
