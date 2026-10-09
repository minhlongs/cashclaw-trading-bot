import type { HypothesisNode, RegistryBridgeEntry } from './lineage-types';
import { findNode, TERMINAL_STATUSES } from './lineage.assertions';

export function descendants(nodes: readonly HypothesisNode[], id: string): HypothesisNode[] {
  const result: HypothesisNode[] = [], seen = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const node of nodes) {
      if (node.parentId !== null && frontier.has(node.parentId) && !seen.has(node.id)) {
        seen.add(node.id); result.push(node); next.add(node.id);
      }
    }
    frontier = next;
  }
  return result;
}

export function ancestors(nodes: readonly HypothesisNode[], id: string): HypothesisNode[] {
  const result: HypothesisNode[] = [], seen = new Set<string>();
  let current = findNode(nodes, id);
  while (current !== undefined && current.parentId !== null) {
    if (seen.has(current.parentId)) break;
    const parent = findNode(nodes, current.parentId);
    if (parent === undefined) break;
    seen.add(parent.id); result.push(parent); current = parent;
  }
  return result;
}

export function isDeadEnd(nodes: readonly HypothesisNode[], id: string): boolean {
  const node = findNode(nodes, id);
  if (node === undefined || node.status !== 'FALSIFIED') return false;
  return descendants(nodes, id).every((desc) => TERMINAL_STATUSES.has(desc.status));
}

export function lineageToRegistryEntries(node: HypothesisNode): RegistryBridgeEntry {
  return { hypothesisId: node.id, parentId: node.parentId, mutation: node.mutation };
}
