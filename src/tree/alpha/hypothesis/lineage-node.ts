import type { HypothesisNode } from './lineage-types';
import { assertValidId, assertNotSelfParent, assertChildPrefix, findNode } from './lineage.assertions';
import { descendants } from './lineage-queries';

export function createNode(
  id: string, parentId: string | null, mutation: string | null = null,
  evidence: readonly string[] = [], createdAt = 0, existingNodes: readonly HypothesisNode[] = [],
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

export function addChild(
  nodes: readonly HypothesisNode[], parentId: string, childId: string,
  mutation: string | null = null, evidence: readonly string[] = [], createdAt = 0,
): HypothesisNode[] {
  assertValidId(childId, 'child');
  assertNotSelfParent(childId, parentId);
  if (findNode(nodes, childId) !== undefined) {
    const wouldCycle = descendants(nodes, childId).some((node) => node.id === parentId);
    throw new Error(wouldCycle ? `Adding "${childId}" under "${parentId}" would create a cycle` : `Node "${childId}" already exists in lineage graph`);
  }
  const child = createNode(childId, parentId, mutation, evidence, createdAt, nodes);
  return [...nodes, child];
}
