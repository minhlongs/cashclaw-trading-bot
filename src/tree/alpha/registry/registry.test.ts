// Research Registry — tests
// Pure, deterministic, no I/O. Covers dedup rejection, immutability,
// summary math, seed integrity, canonical JSON determinism, and
// entryConfigHash determinism.

import { describe, it, expect } from 'vitest';
import {
  createRegistry,
  addEntry,
  falsifyEntry,
  summarize,
  toCanonicalJson,
  entryConfigHash,
  SEED_FALSIFIED,
} from './index';

function makeEntry(overrides: Partial<typeof SEED_FALSIFIED[number]> = {}) {
  const id = overrides.id ?? 'test-entry';
  return {
    ...SEED_FALSIFIED[0],
    id,
    hypothesis: overrides.hypothesis ?? `hypothesis for ${id}`,
    status: 'PROPOSED' as const,
    falsificationReason: null,
    result: {
      oosPassCount: 0,
      oosTotalCount: 10,
      aggregatePnlUsd: 0,
      summary: 'test',
    },
    ...overrides,
  };
}

describe('createRegistry', () => {
  it('creates an empty registry with zero counts', () => {
    const r = createRegistry();
    expect(r.entries).toEqual([]);
    expect(r.counts).toEqual({
      PROPOSED: 0,
      RUNNING: 0,
      SURVIVED: 0,
      FALSIFIED: 0,
      ARCHIVED: 0,
    });
  });
});

describe('addEntry', () => {
  it('rejects empty id', () => {
    const r = createRegistry();
    expect(() => addEntry(r, makeEntry({ id: '' }))).toThrow(/id/);
  });

  it('rejects duplicate hypothesis + config hash', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a' }));
    // Same hypothesis AND same configuration (hash) → must be rejected.
    expect(() =>
      addEntry(r, makeEntry({ id: 'b', hypothesis: makeEntry({ id: 'a' }).hypothesis })),
    ).toThrow(/Duplicate/);
  });

  it('rejects duplicate id', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'dup' }));
    expect(() => addEntry(r, makeEntry({ id: 'dup' }))).toThrow(/Duplicate/);
  });

  it('accepts a genuinely different hypothesis with same feature set', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a', hypothesis: 'hypothesis one' }));
    expect(() =>
      addEntry(r, makeEntry({ id: 'b', hypothesis: 'hypothesis two' })),
    ).not.toThrow();
  });
});

describe('immutability', () => {
  it('does not mutate the input registry on addEntry', () => {
    const r = createRegistry();
    const before = JSON.parse(JSON.stringify(r));
    addEntry(r, makeEntry({ id: 'a' }));
    expect(JSON.parse(JSON.stringify(r))).toEqual(before);
  });

  it('does not mutate the input registry on falsifyEntry', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a' }));
    const before = JSON.parse(JSON.stringify(r));
    falsifyEntry(r, 'a', 'because');
    expect(JSON.parse(JSON.stringify(r))).toEqual(before);
  });
});

describe('falsifyEntry', () => {
  it('returns a new registry with the entry marked FALSIFIED', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a' }));
    const updated = falsifyEntry(r, 'a', 'overfit');
    expect(updated.entries[0].status).toBe('FALSIFIED');
    expect(updated.entries[0].falsificationReason).toBe('overfit');
    expect(r.entries[0].status).not.toBe('FALSIFIED');
  });

  it('throws on unknown id', () => {
    const r = createRegistry();
    expect(() => falsifyEntry(r, 'nope', 'x')).toThrow(/unknown/);
  });

  it('throws on empty reason', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a' }));
    expect(() => falsifyEntry(r, 'a', '   ')).toThrow(/non-empty/);
  });
});

describe('summarize', () => {
  it('reports zero counts for an empty registry', () => {
    expect(summarize(createRegistry())).toEqual({
      total: 0,
      proposed: 0,
      running: 0,
      survived: 0,
      falsified: 0,
      archived: 0,
      oosPassCount: 0,
    });
  });

  it('computes status counts and aggregates OOS passes', () => {
    let r = createRegistry();
    r = addEntry(
      r,
      makeEntry({
        id: 'a',
        status: 'PROPOSED',
        result: { oosPassCount: 3, oosTotalCount: 10, aggregatePnlUsd: 0, summary: 's' },
      }),
    );
    r = addEntry(
      r,
      makeEntry({
        id: 'b',
        status: 'FALSIFIED',
        falsificationReason: 'r',
        result: { oosPassCount: 1, oosTotalCount: 5, aggregatePnlUsd: 0, summary: 's' },
      }),
    );
    r = addEntry(
      r,
      makeEntry({
        id: 'c',
        status: 'SURVIVED',
        result: { oosPassCount: 0, oosTotalCount: 2, aggregatePnlUsd: 0, summary: 's' },
      }),
    );
    const s = summarize(r);
    expect(s).toEqual({
      total: 3,
      proposed: 1,
      running: 0,
      survived: 1,
      falsified: 1,
      archived: 0,
      oosPassCount: 4,
    });
  });
});

describe('entryConfigHash', () => {
  it('is deterministic (same input → same output)', () => {
    const a = entryConfigHash(SEED_FALSIFIED[0]);
    const b = entryConfigHash(SEED_FALSIFIED[0]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs when the configuration changes', () => {
    const a = entryConfigHash(SEED_FALSIFIED[0]);
    const b = entryConfigHash({
      ...SEED_FALSIFIED[0],
      hypothesis: 'totally different hypothesis',
    });
    expect(a).not.toBe(b);
  });

  it('ignores outcome-only fields (status, falsificationReason)', () => {
    const a = entryConfigHash(SEED_FALSIFIED[0]);
    const b = entryConfigHash({
      ...SEED_FALSIFIED[0],
      status: 'ARCHIVED',
      falsificationReason: 'something else',
    });
    expect(a).toBe(b);
  });
});

describe('toCanonicalJson', () => {
  it('is deterministic (same input → same output)', () => {
    const r = createRegistry();
    const a = toCanonicalJson(r);
    const b = toCanonicalJson(r);
    expect(a).toBe(b);
  });

  it('differs when entries change', () => {
    let r = createRegistry();
    const empty = toCanonicalJson(r);
    r = addEntry(r, makeEntry({ id: 'a' }));
    expect(toCanonicalJson(r)).not.toBe(empty);
  });

  it('sorts keys (stable regardless of insertion order)', () => {
    let r = createRegistry();
    r = addEntry(r, makeEntry({ id: 'a' }));
    const a = toCanonicalJson(r);
    const parsed = JSON.parse(a);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort((x, y) => x.localeCompare(y)));
  });
});

describe('SEED_FALSIFIED', () => {
  it('contains exactly 30 entries', () => {
    expect(SEED_FALSIFIED.length).toBe(30);
  });

  it('all entries are FALSIFIED', () => {
    for (const e of SEED_FALSIFIED) {
      expect(e.status).toBe('FALSIFIED');
    }
  });

  it('every entry has a non-empty falsificationReason', () => {
    for (const e of SEED_FALSIFIED) {
      expect(e.falsificationReason).toBeTruthy();
    }
  });

  it('every entry has reproducibility class-level', () => {
    for (const e of SEED_FALSIFIED) {
      expect(e.reproducibility).toBe('class-level');
    }
  });

  it('every entry has a non-empty id, hypothesis, and featureSet', () => {
    for (const e of SEED_FALSIFIED) {
      expect(e.id.trim()).not.toBe('');
      expect(e.hypothesis.trim()).not.toBe('');
      expect(e.featureSet.length).toBeGreaterThan(0);
    }
  });

  it('loads into a registry without duplicate rejection', () => {
    let r = createRegistry();
    for (const e of SEED_FALSIFIED) {
      r = addEntry(r, e);
    }
    expect(r.entries.length).toBe(30);
    expect(summarize(r).falsified).toBe(30);
    expect(summarize(r).oosPassCount).toBe(20);
  });

  it('ids are unique', () => {
    const ids = SEED_FALSIFIED.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});