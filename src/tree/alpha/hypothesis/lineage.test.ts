import { describe, it, expect } from 'vitest';
import {
  createNode,
  addChild,
  descendants,
  ancestors,
  isDeadEnd,
  lineageToRegistryEntries,
} from './lineage';
import type { HypothesisNode, HypothesisNodeStatus } from './lineage-types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildChain(): HypothesisNode[] {
  const root = createNode('H001', null, null, [], 1000);
  const withChild = addChild([root], 'H001', 'H001-A', 'add-regime-filter', [], 2000);
  return addChild(withChild, 'H001-A', 'H001-A-REGIME', 'split-by-regime', ['backtest-2024'], 3000);
}

function makeNode(id: string, parentId: string | null, status: HypothesisNodeStatus): HypothesisNode {
  return { id, parentId, mutation: null, evidence: [], status, createdAt: 0 };
}

// ── createNode ─────────────────────────────────────────────────────────────────

describe('createNode', () => {
  it('creates a root node with PROPOSED status', () => {
    const node = createNode('H001', null, 'initial', ['evidence-1'], 42);
    expect(node).toEqual({ id: 'H001', parentId: null, mutation: 'initial', evidence: ['evidence-1'], status: 'PROPOSED', createdAt: 42 });
  });

  it('creates a child node when parent exists', () => {
    const parent = createNode('H001', null);
    const child = createNode('H001-A', 'H001', 'mutation-x', [], 5, [parent]);
    expect(child.parentId).toBe('H001');
  });

  it('rejects invalid id formats', () => {
    for (const bad of ['X001', 'h001', 'H01', 'H0011', 'H001-a']) {
      expect(() => createNode(bad, null)).toThrow(/Invalid lineage/);
    }
  });

  it('rejects child when parent not in graph', () => {
    expect(() => createNode('H001-A', 'H001')).toThrow(/not found/);
  });

  it('rejects self-parent', () => {
    const node = createNode('H001', null);
    expect(() => createNode('H001', 'H001', null, [], 0, [node])).toThrow(/own parent/);
  });
});

// ── addChild ───────────────────────────────────────────────────────────────────

describe('addChild', () => {
  it('appends child and returns new array', () => {
    const root = createNode('H001', null);
    const result = addChild([root], 'H001', 'H001-A', 'mut');
    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe('H001-A');
  });

  it('does not mutate the input array', () => {
    const root = createNode('H001', null);
    const original = [root];
    const copy = [...original];
    addChild(original, 'H001', 'H001-A');
    expect(original).toEqual(copy);
    expect(original).toHaveLength(1);
  });

  it('rejects duplicate child id', () => {
    const root = createNode('H001', null);
    const withChild = addChild([root], 'H001', 'H001-A');
    expect(() => addChild(withChild, 'H001', 'H001-A')).toThrow(/already exists/);
  });

  it('rejects cycle: adding ancestor as child of its descendant', () => {
    const chain = buildChain();
    expect(() => addChild(chain, 'H001-A-REGIME', 'H001')).toThrow(/cycle/);
  });

  it('rejects self-parent via addChild', () => {
    const root = createNode('H001', null);
    expect(() => addChild([root], 'H001', 'H001')).toThrow(/own parent/);
  });

  it('rejects child id that does not extend parent prefix', () => {
    const root = createNode('H001', null);
    expect(() => addChild([root], 'H001', 'H002-A')).toThrow(/must start with parent/);
  });

  it('rejects child with invalid id format', () => {
    const root = createNode('H001', null);
    expect(() => addChild([root], 'H001', 'H001-lowercase')).toThrow(/Invalid lineage/);
  });
});

// ── descendants ────────────────────────────────────────────────────────────────

describe('descendants', () => {
  it('returns all downward-reachable nodes excluding the node itself', () => {
    const chain = buildChain();
    const ids = descendants(chain, 'H001').map((n) => n.id);
    expect(ids).toContain('H001-A');
    expect(ids).toContain('H001-A-REGIME');
    expect(ids).not.toContain('H001');
    expect(ids).toHaveLength(2);
  });

  it('returns empty for leaf or unknown id', () => {
    expect(descendants(buildChain(), 'H001-A-REGIME')).toEqual([]);
    expect(descendants([], 'H999')).toEqual([]);
  });
});

// ── ancestors ──────────────────────────────────────────────────────────────────

describe('ancestors', () => {
  it('returns all upward-reachable nodes nearest-first', () => {
    const anc = ancestors(buildChain(), 'H001-A-REGIME');
    expect(anc.map((n) => n.id)).toEqual(['H001-A', 'H001']);
  });

  it('returns empty for root or unknown id', () => {
    expect(ancestors(buildChain(), 'H001')).toEqual([]);
    expect(ancestors([], 'H999')).toEqual([]);
  });
});

// ── isDeadEnd ──────────────────────────────────────────────────────────────────

describe('isDeadEnd', () => {
  it('falsified leaf with no children is a dead end', () => {
    expect(isDeadEnd([makeNode('H001', null, 'FALSIFIED')], 'H001')).toBe(true);
  });

  it('falsified node with a SURVIVED child is NOT a dead end', () => {
    const nodes = [makeNode('H001', null, 'FALSIFIED'), makeNode('H001-A', 'H001', 'SURVIVED')];
    expect(isDeadEnd(nodes, 'H001')).toBe(false);
  });

  it('falsified node with only FALSIFIED/ARCHIVED descendants IS a dead end', () => {
    const nodes = [
      makeNode('H001', null, 'FALSIFIED'),
      makeNode('H001-A', 'H001', 'FALSIFIED'),
      makeNode('H001-A-B', 'H001-A', 'ARCHIVED'),
    ];
    expect(isDeadEnd(nodes, 'H001')).toBe(true);
  });

  it('falsified node with a PROPOSED grandchild is NOT a dead end', () => {
    const nodes = [
      makeNode('H001', null, 'FALSIFIED'),
      makeNode('H001-A', 'H001', 'FALSIFIED'),
      makeNode('H001-A-B', 'H001-A', 'PROPOSED'),
    ];
    expect(isDeadEnd(nodes, 'H001')).toBe(false);
  });

  it('non-falsified or unknown node is never a dead end', () => {
    expect(isDeadEnd([makeNode('H001', null, 'SURVIVED')], 'H001')).toBe(false);
    expect(isDeadEnd([], 'H999')).toBe(false);
  });
});

// ── lineageToRegistryEntries ───────────────────────────────────────────────────

describe('lineageToRegistryEntries', () => {
  it('maps node fields to bridge shape', () => {
    const parent = createNode('H001', null);
    const node = createNode('H001-A', 'H001', 'regime-split', ['bt-1'], 100, [parent]);
    expect(lineageToRegistryEntries(node)).toEqual({ hypothesisId: 'H001-A', parentId: 'H001', mutation: 'regime-split' });
  });

  it('maps root node with null parent and mutation', () => {
    expect(lineageToRegistryEntries(createNode('H002', null))).toEqual({ hypothesisId: 'H002', parentId: null, mutation: null });
  });
});

// ── Full chain integration ─────────────────────────────────────────────────────

describe('lineage chain H001 → H001-A → H001-A-REGIME', () => {
  it('builds a valid 3-node chain', () => {
    const chain = buildChain();
    expect(chain).toHaveLength(3);
    expect(chain.map((n) => n.id)).toEqual(['H001', 'H001-A', 'H001-A-REGIME']);
  });

  it('supports multi-level ancestor and descendant traversal', () => {
    const chain = buildChain();
    expect(ancestors(chain, 'H001-A-REGIME')).toHaveLength(2);
    expect(descendants(chain, 'H001')).toHaveLength(2);
  });

  it('rejects adding H001 as child of H001-A-REGIME (cycle)', () => {
    expect(() => addChild(buildChain(), 'H001-A-REGIME', 'H001')).toThrow(/cycle/);
  });
});
