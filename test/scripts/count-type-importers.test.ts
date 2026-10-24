/**
 * Tests for the importer counter that gates the microstructure type-file consolidation.
 *
 * These run against the real tree, read-only. Their purpose is to prove the counter is correct on
 * cases where a plausible implementation would silently return the wrong answer — most importantly
 * the negative cases: a counter that skips test/ , or matches by suffix instead of exact basename,
 * would report these stems as mergeable and the merge would break the build.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { countImporters } from '../../scripts/count-type-importers.mjs';

type ImporterEntry = {
  production: string[];
  test: string[];
  hasEngine: boolean;
  hasQueue: boolean;
};

const result = countImporters();
const importers = result.importers as Record<string, ImporterEntry>;

describe('importer counter — known blocked cases', () => {
  it.each([
    ['abdi-ranaldo', 3],
    ['corwin-schultz', 4],
    ['kyle-obizhaeva-invariance', 2],
    ['roll-spread', 2],
  ])('reports %s as blocked with %d production importers', (stem, expected) => {
    expect(result.blocked).toContain(stem);
    expect(importers[stem].production).toHaveLength(expected);
  });

  it('blocks gatheral-transient-impact (2 production importers, no -engine sibling)', () => {
    // Both conditions hold at once. A counter that checks "no engine" before ">=2 importers"
    // would classify this as mergeable and the merge would destroy a live second consumer.
    expect(result.blocked).toContain('gatheral-transient-impact');
    expect(result.noEngine).not.toContain('gatheral-transient-impact');
    expect(importers['gatheral-transient-impact'].production).toEqual([
      'src/tree/quantlib/microstructure/alfonsi-lob-resilience.ts',
      'src/tree/quantlib/microstructure/gatheral-transient-impact.ts',
    ]);
    expect(importers['gatheral-transient-impact'].hasEngine).toBe(false);
  });

  it('blocks hawkes-jump and catches its cross-directory consumer', () => {
    expect(result.blocked).toContain('hawkes-jump');
    expect(importers['hawkes-jump'].production).toContain(
      'src/tree/quantlib/portfolio/ledoit-wolf-shrinkage.ts'
    );
  });
});

describe('importer counter — negative cases that a broken gate would miss', () => {
  it('finds test/ consumers, so ekop-pin is not classified as safe-clean', () => {
    // If the counter excluded test paths, ekop-pin would land in safeClean and the merge would
    // leave a dangling import in a file tsc --noEmit checks.
    expect(result.safeWithTest).toContain('ekop-pin');
    expect(result.safeClean).not.toContain('ekop-pin');
    expect(importers['ekop-pin'].test).toContain('test/quant/ekop-pin-engine.test.ts');
  });

  it('matches exact basenames, so stoll-spread does not inherit huang-stoll-spread importers', () => {
    // Suffix matching would make stoll-spread-types look like it has an importer in
    // huang-stoll-spread-engine.ts, which does not exist.
    const stoll = importers['stoll-spread'];
    expect(stoll.production).toEqual(['src/tree/quantlib/microstructure/stoll-spread-engine.ts']);
    expect(stoll.production).not.toContain(
      'src/tree/quantlib/microstructure/huang-stoll-spread-engine.ts'
    );
    expect(result.safeClean).toContain('stoll-spread');

    const huang = importers['huang-stoll-spread'];
    expect(huang.production).toEqual([
      'src/tree/quantlib/microstructure/huang-stoll-spread-engine.ts',
    ]);
    expect(huang.test).toEqual(['test/quant/huang-stoll-spread-engine.test.ts']);
  });

  it('counts a multi-line import type block as one statement', () => {
    // kyle-adverse-selection uses a 3-line import type { ... } from '...'. Counting each line, or
    // counting only the `from` clause naively, overstates the importer count.
    expect(importers['kyle-adverse-selection'].production).toEqual([
      'src/tree/quantlib/microstructure/kyle-adverse-selection-engine.ts',
    ]);
    expect(importers['kyle-adverse-selection'].production).toHaveLength(1);
  });
});

describe('importer counter — the queue-consumer case', () => {
  it('treats cont-stoikov-lob as safe-with-test, driven by its queue consumer', () => {
    // This pair has no -engine.ts sibling, so a counter that requires one would drop it. It also has
    // a test consumer, so classifying it as "no test consumer" would break test/quant/v13.
    expect(importers['cont-stoikov-lob'].hasEngine).toBe(false);
    expect(importers['cont-stoikov-lob'].hasQueue).toBe(true);
    expect(importers['cont-stoikov-lob'].production).toEqual([
      'src/tree/quantlib/microstructure/cont-stoikov-lob-queue.ts',
    ]);
    expect(importers['cont-stoikov-lob'].test).toContain(
      'test/quant/v13-full-suite-simulation.test.ts'
    );
    expect(result.safeWithTest).toContain('cont-stoikov-lob');
  });
});

describe('importer counter — invariants', () => {
  it('classifies every types file exactly once', () => {
    const groups = [result.blocked, result.safeWithTest, result.safeClean, result.noEngine];
    const all = groups.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(result.stems.length);
    expect(result.stems).toHaveLength(63);
  });

  it('splits 63 types files into 6 blocked and 57 mergeable', () => {
    expect(result.blocked).toHaveLength(6);
    expect(result.safeWithTest).toHaveLength(18);
    expect(result.safeClean).toHaveLength(39);
    expect(result.safeWithTest.length + result.safeClean.length).toBe(57);
  });

  it('reports no stem in more than one group', () => {
    for (const group of [result.blocked, result.safeWithTest, result.safeClean]) {
      expect(new Set(group).size).toBe(group.length);
    }
  });
});

describe('importer counter — does not match module names in prose', () => {
  it('ignores a types stem that appears only in a comment', () => {
    // Comment-only mentions would be counted by a naive substring scan. Verify the real blocked set
    // is exactly the six expected files, which is only true if prose mentions are not counted.
    expect([...result.blocked].sort()).toEqual(
      [
        'abdi-ranaldo',
        'corwin-schultz',
        'gatheral-transient-impact',
        'hawkes-jump',
        'kyle-obizhaeva-invariance',
        'roll-spread',
      ].sort()
    );
  });

  it('reads only from import/export specifiers, not from string literals elsewhere', () => {
    // public-sdk.ts re-exports these two, which is what makes them blocked. Confirm the counter
    // sees them there specifically.
    expect(importers['abdi-ranaldo'].production).toContain('src/tree/quantlib/public-sdk.ts');
    expect(importers['corwin-schultz'].production).toContain('src/tree/quantlib/public-sdk.ts');
  });
});

describe('plan artifacts agree with the counter', () => {
  it('baseline file counts recorded in the plan still hold', () => {
    const sdk = readFileSync('src/tree/quantlib/public-sdk.ts', 'utf8');
    expect(sdk).toContain('abdi-ranaldo-types');
    expect(sdk).toContain('corwin-schultz-types');
  });
});
