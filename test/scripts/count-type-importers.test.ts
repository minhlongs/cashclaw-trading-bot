/**
 * Tests for the importer counter that gates the microstructure type-file consolidation.
 *
 * The behavioural cases run against scratch trees built by `fs.mkdtempSync`, not the live tree. They
 * exist to prove the counter is correct on cases where a plausible implementation would silently
 * return the wrong answer: a counter that skips `test/`, or matches by suffix instead of exact
 * basename, would report a stem as mergeable and the merge would break the build. Those properties
 * have to survive the consolidation itself, so they are pinned against fixtures whose shapes are
 * reproduced on demand rather than against live files the merge deletes.
 *
 * The live-tree assertions at the end cover only the blocked set, which the merge never touches.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countImporters } from '../../scripts/count-type-importers.mjs';

const MICRO = 'src/tree/quantlib/microstructure';

// The counter builds `importers` as a plain object, so TypeScript infers `{}` for it. Reading a stem
// off it needs a declared entry shape; without this, a typo in a stem name would not be caught.
type ImporterEntry = {
  production: string[];
  test: string[];
  hasEngine: boolean;
  hasQueue: boolean;
};

function entriesOf(result: ReturnType<typeof countImporters>): Record<string, ImporterEntry> {
  return result.importers as Record<string, ImporterEntry>;
}

let root: string;

function scaffold(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'count-importers-'));
  const dir = join(root, MICRO);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function writeOutside(relPath: string, text: string) {
  const abs = join(root, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text);
}

beforeEach(() => {
  root = '';
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const TYPES = `export interface WidgetConfig {
  readonly size: number;
}

export interface WidgetResult {
  readonly fitted: boolean;
}
`;

describe('importer counter — negative cases that a broken gate would miss', () => {
  it('finds test/ consumers, so a stem with one is not classified as safe-clean', () => {
    // If the counter excluded test paths, this stem would land in safeClean and the merge would
    // leave a dangling import in a file tsc --noEmit checks.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): WidgetConfig {
    return config;
  }
}
`,
    });
    writeOutside(
      'test/quant/widget-engine.test.ts',
      `import type { WidgetResult } from '../../src/tree/quantlib/microstructure/widget-types';\nexport function tally(): WidgetResult {\n  return { fitted: true };\n}\n`
    );

    const result = countImporters(root);

    expect(result.safeWithTest).toContain('widget');
    expect(result.safeClean).not.toContain('widget');
    expect(entriesOf(result).widget.test).toEqual(['test/quant/widget-engine.test.ts']);
    expect(entriesOf(result).widget.production).toHaveLength(1);
  });

  it('matches exact basenames, so a short stem does not inherit a longer one', () => {
    // Suffix matching would make widget-types look like it has an importer inside
    // long-widget-engine.ts, which does not exist.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): WidgetConfig {
    return config;
  }
}
`,
      'long-widget-types.ts': TYPES,
      'long-widget-engine.ts': `import type { WidgetConfig } from './long-widget-types';

export class LongWidgetEngine {
  public static fit(config: WidgetConfig): WidgetConfig {
    return config;
  }
}
`,
    });

    const result = countImporters(root);

    expect(entriesOf(result).widget.production).toEqual([
      'src/tree/quantlib/microstructure/widget-engine.ts',
    ]);
    expect(entriesOf(result).widget.production).not.toContain(
      'src/tree/quantlib/microstructure/long-widget-engine.ts'
    );
    expect(result.safeClean).toContain('widget');

    expect(entriesOf(result)['long-widget'].production).toEqual([
      'src/tree/quantlib/microstructure/long-widget-engine.ts',
    ]);
    expect(result.safeClean).toContain('long-widget');
  });

  it('counts a multi-line import type block as one statement', () => {
    // A three-line `import type { ... } from '...'` is a single importer. Counting each line, or
    // counting naively by clause, overstates the importer count and blocks a mergeable pair.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type {
  WidgetConfig,
  WidgetResult,
} from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): WidgetResult {
    return { fitted: config.size > 0 };
  }
}
`,
    });

    const result = countImporters(root);

    expect(entriesOf(result).widget.production).toEqual([
      'src/tree/quantlib/microstructure/widget-engine.ts',
    ]);
    expect(entriesOf(result).widget.production).toHaveLength(1);
    expect(result.safeClean).toContain('widget');
  });

  it('ignores a stem that appears only in prose', () => {
    // Comment-only mentions would be counted by a naive substring scan.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `// widget-types is referenced here in prose, not imported.
export class WidgetEngine {
  public static fit(): boolean {
    return true;
  }
}
`,
    });

    const result = countImporters(root);

    expect(entriesOf(result).widget.production).toEqual([]);
    expect(entriesOf(result).widget.test).toEqual([]);
    expect(result.noEngine).not.toContain('widget');
  });
});

describe('importer counter — the queue-consumer case', () => {
  it('treats a -queue consumer as the single production importer', () => {
    // This shape has no -engine.ts sibling, so a counter that requires one would drop the pair. It
    // also has a test consumer, so classifying it as "no test consumer" would break the test file.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-queue.ts': `import type {
  WidgetConfig,
  WidgetResult,
} from './widget-types';

export class WidgetQueueEngine {
  public static enqueue(config: WidgetConfig): WidgetResult {
    return { fitted: config.size > 0 };
  }
}
`,
    });
    writeOutside(
      'test/quant/widget-queue.test.ts',
      `import type { WidgetResult } from '../../src/tree/quantlib/microstructure/widget-types';\nexport function tally(): WidgetResult {\n  return { fitted: true };\n}\n`
    );

    const result = countImporters(root);

    expect(entriesOf(result).widget.hasEngine).toBe(false);
    expect(entriesOf(result).widget.hasQueue).toBe(true);
    expect(entriesOf(result).widget.production).toEqual([
      'src/tree/quantlib/microstructure/widget-queue.ts',
    ]);
    expect(entriesOf(result).widget.test).toEqual(['test/quant/widget-queue.test.ts']);
    expect(result.safeWithTest).toContain('widget');
  });
});

describe('importer counter — group precedence', () => {
  it('blocks a stem with >=2 production importers even when it has no engine sibling', () => {
    // Both conditions hold at once. A counter that checks "no engine" before ">=2 importers"
    // would classify this as mergeable and the merge would destroy a live second consumer.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-a.ts': `import type { WidgetConfig } from './widget-types';\nexport function a(c: WidgetConfig): WidgetConfig {\n  return c;\n}\n`,
      'widget-b.ts': `import type { WidgetResult } from './widget-types';\nexport function b(): WidgetResult {\n  return { fitted: true };\n}\n`,
    });

    const result = countImporters(root);

    expect(result.blocked).toContain('widget');
    expect(result.noEngine).not.toContain('widget');
    expect(entriesOf(result).widget.production).toHaveLength(2);
    expect(entriesOf(result).widget.hasEngine).toBe(false);
  });
});

describe('importer counter — invariants', () => {
  it('classifies every stem exactly once, and the groups total the stem count', () => {
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';\nexport class WidgetEngine {}\n`,
      'gadget-types.ts': TYPES,
      'gadget-a.ts': `import type { WidgetConfig } from './gadget-types';\nexport function a(c: WidgetConfig) { return c; }\n`,
      'gadget-b.ts': `import type { WidgetResult } from './gadget-types';\nexport function b() { return { fitted: true }; }\n`,
      'lonely-types.ts': TYPES,
    });

    const result = countImporters(root);
    const groups = [result.blocked, result.safeWithTest, result.safeClean, result.noEngine];
    const all = groups.flat();

    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(result.stems.length);
    expect(all.slice().sort()).toEqual(result.stems.slice().sort());
    for (const group of groups) expect(new Set(group).size).toBe(group.length);
  });

  it('fails to find the microstructure directory in a scratch tree that has none', () => {
    root = mkdtempSync(join(tmpdir(), 'count-importers-empty-'));
    expect(() => countImporters(root)).toThrow(/microstructure/);
  });
});

describe('importer counter — blocked set on the live tree', () => {
  // The merge never touches a stem with >=2 production importers, so these assertions are stable
  // across the whole consolidation and are the reason the gate exists.
  const live = countImporters();

  it('reports exactly the six expected blocked stems', () => {
    expect([...live.blocked].sort()).toEqual(
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

  it('blocks gatheral-transient-impact with 2 production importers and no -engine sibling', () => {
    expect(live.noEngine).not.toContain('gatheral-transient-impact');
    expect(entriesOf(live)['gatheral-transient-impact'].production).toEqual([
      'src/tree/quantlib/microstructure/alfonsi-lob-resilience.ts',
      'src/tree/quantlib/microstructure/gatheral-transient-impact.ts',
    ]);
    expect(entriesOf(live)['gatheral-transient-impact'].hasEngine).toBe(false);
  });

  it('blocks hawkes-jump and catches its cross-directory consumer', () => {
    expect(entriesOf(live)['hawkes-jump'].production).toContain(
      'src/tree/quantlib/portfolio/ledoit-wolf-shrinkage.ts'
    );
  });

  it('sees the blocked stems in public-sdk re-exports, not in prose', () => {
    expect(entriesOf(live)['abdi-ranaldo'].production).toContain('src/tree/quantlib/public-sdk.ts');
    expect(entriesOf(live)['corwin-schultz'].production).toContain('src/tree/quantlib/public-sdk.ts');
  });

  it('leaves no mergeable pair once the consolidation has run', () => {
    // After the merge every remaining types file has >=2 production importers, so nothing is left
    // for the merge script to act on. A mergeable pair surviving here would mean a batch was missed.
    expect(live.safeClean).toEqual([]);
    expect(live.safeWithTest).toEqual([]);
    expect(live.blocked).toHaveLength(live.stems.length);
  });
});

describe('plan artifacts agree with the counter', () => {
  it('baseline file counts recorded in the plan still hold', () => {
    const sdk = readFileSync('src/tree/quantlib/public-sdk.ts', 'utf8');
    expect(sdk).toContain('abdi-ranaldo-types');
    expect(sdk).toContain('corwin-schultz-types');
  });
});
