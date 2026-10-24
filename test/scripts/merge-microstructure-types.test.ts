/**
 * Tests for the merge script that gates the microstructure type-file consolidation.
 *
 * Every case runs against a scratch tree built by `fs.mkdtempSync`. None of them touch the real
 * `src/tree/quantlib/microstructure`, so a bug in the script cannot damage production files or leave
 * a half-merged pair behind. The cases pin the behaviours that a plausible implementation would get
 * wrong: dry-run leaking writes, a single-line strip pattern missing multi-line statements,
 * non-idempotent appends, and a fail-open gate on importer count or LOC.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergePair } from '../../scripts/merge-microstructure-types.mjs';

const MICRO = 'src/tree/quantlib/microstructure';

let root: string;

/** Build a scratch worktree with a microstructure directory containing the given files. */
function scaffold(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'merge-types-'));
  const dir = join(root, MICRO);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
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

/** A single-importer pair with a multi-line `import type {` statement — the shape of 10 of 57 pairs. */
function pairWithMultiLineImport() {
  return {
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
  };
}

describe('merge script — dry-run writes nothing', () => {
  it('leaves both files byte-identical and reports the projected size', () => {
    scaffold(pairWithMultiLineImport());
    const before = {
      engine: readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8'),
      types: readFileSync(join(root, MICRO, 'widget-types.ts'), 'utf8'),
    };

    const outcome = mergePair('widget', { dryRun: true, root, git: false });

    expect(outcome.ok).toBe(true);
    expect(outcome.dryRun).toBe(true);
    // The append emits the 5-line body, one blank line, then two 3-line blocks separated by a blank.
    expect(outcome.projected).toBe(13);
    // The statement spans 4 physical lines. A single-line strip pattern would report 1 and leave
    // three orphan lines behind, which is exactly the failure this asserts against.
    expect(outcome.statementLines).toBe(4);
    expect(readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8')).toBe(before.engine);
    expect(readFileSync(join(root, MICRO, 'widget-types.ts'), 'utf8')).toBe(before.types);
    expect(existsSync(join(root, MICRO, 'widget-types.ts'))).toBe(true);
  });
});

describe('merge script — write merges the type blocks', () => {
  it('moves both interfaces into the engine and removes the whole multi-line statement', () => {
    scaffold(pairWithMultiLineImport());

    const outcome = mergePair('widget', { dryRun: false, root, git: false });

    expect(outcome.ok).toBe(true);
    expect(outcome.blocksAdded).toBe(2);

    const engine = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');
    expect(engine).toContain('export interface WidgetConfig');
    expect(engine).toContain('export interface WidgetResult');
    expect(engine).toContain('export class WidgetEngine');
    // No orphan from any of the four statement lines, and no surviving reference at all.
    expect(engine).not.toContain('widget-types');
    expect(engine).not.toContain('WidgetConfig,\n  WidgetResult,');
    // The import statement is gone, not merely emptied.
    expect(engine.split('\n')[0]).not.toMatch(/import/);
    // The projection must equal the file actually written, or the ceiling check is meaningless.
    expect(engine.replace(/\n+$/, '').split('\n').length).toBe(outcome.projected);
  });

  it('strips a bare multi-line `import {` statement as well', () => {
    // Three pairs (admati-pfleiderer, grossman-stiglitz, ohara-oldfield-inventory) import pure types
    // through a bare `import {` under `isolatedModules`. A type-only pattern would leave them behind.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import {
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

    expect(mergePair('widget', { dryRun: false, root, git: false }).ok).toBe(true);

    const engine = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');
    expect(engine).not.toContain('widget-types');
    expect(engine).not.toContain('WidgetConfig,');
    expect(engine).toContain('export interface WidgetResult');
  });
});

describe('merge script — idempotent', () => {
  it('produces byte-identical output when a merge is retried', () => {
    // With `git: false` the types file is unlinked on the first run, so the retry cannot find its
    // source and must leave the consumer exactly as it is. The property under test is the output, not
    // the exit code: a second run that appended again would double every block.
    scaffold(pairWithMultiLineImport());

    const first = mergePair('widget', { dryRun: false, root, git: false });
    expect(first.ok).toBe(true);
    const afterFirst = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');

    const second = mergePair('widget', { dryRun: false, root, git: false });

    expect(readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8')).toBe(afterFirst);
    expect((afterFirst.match(/export interface WidgetConfig/g) ?? []).length).toBe(1);
    expect((afterFirst.match(/export interface WidgetResult/g) ?? []).length).toBe(1);
    // Either the retry recognises the work as done, or it refuses because the source is gone.
    // Both are safe; a duplicate append is not.
    expect(second.ok === false || second.noop === true || second.blocksAdded === 0).toBe(true);
  });

  it('leaves the consumer untouched on a retry that re-adds the source file', () => {
    // After a successful merge the engine no longer references the types file, so the counter reports
    // zero importers and the pair is no longer mergeable at all. Whatever the retry reports, the file
    // it already produced must not gain a second copy of the blocks.
    scaffold(pairWithMultiLineImport());
    mergePair('widget', { dryRun: false, root, git: false });
    const afterFirst = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');

    writeFileSync(join(root, MICRO, 'widget-types.ts'), TYPES);
    mergePair('widget', { dryRun: false, root, git: false });

    const afterSecond = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');
    expect(afterSecond).toBe(afterFirst);
    expect((afterSecond.match(/export interface WidgetConfig/g) ?? []).length).toBe(1);
    expect((afterSecond.match(/export interface WidgetResult/g) ?? []).length).toBe(1);
  });

  it('skips a block that already exists in the consumer, and appends only the new one', () => {
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetResult } from './widget-types';

export interface WidgetConfig {
  readonly size: number;
}

export class WidgetEngine {
  public static fit(): WidgetResult {
    return { fitted: true };
  }
}
`,
    });

    const outcome = mergePair('widget', { dryRun: false, root, git: false });

    expect(outcome.ok).toBe(true);
    expect(outcome.blocksAdded).toBe(1);
    const engine = readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8');
    expect((engine.match(/export interface WidgetConfig/g) ?? []).length).toBe(1);
    expect(engine).not.toContain('widget-types');
  });
});

describe('merge script — fails closed', () => {
  it('refuses a stem with two production importers', () => {
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): boolean {
    return config.size > 0;
  }
}
`,
      'widget-calculator.ts': `import type { WidgetResult } from './widget-types';

export function summarise(): WidgetResult {
  return { fitted: true };
}
`,
    });

    const outcome = mergePair('widget', { dryRun: false, root, git: false });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain('importer');
    // Nothing was written and the types file still exists.
    expect(readFileSync(join(root, MICRO, 'widget-calculator.ts'), 'utf8')).toContain('widget-types');
    expect(existsSync(join(root, MICRO, 'widget-types.ts'))).toBe(true);
  });

  it('refuses a second importer that sits outside microstructure', () => {
    // Every real blocked pair has its extra consumer outside this directory, so a counter that only
    // scanned microstructure would call them mergeable.
    scaffold({
      'widget-types.ts': TYPES,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): boolean {
    return config.size > 0;
  }
}
`,
    });
    mkdirSync(join(root, 'src/tree/quantlib/portfolio'), { recursive: true });
    writeFileSync(
      join(root, 'src/tree/quantlib/portfolio/widget-shrinkage.ts'),
      `import type { WidgetResult } from '../microstructure/widget-types';\nexport function tally(): WidgetResult {\n  return { fitted: true };\n}\n`
    );

    const outcome = mergePair('widget', { dryRun: false, root, git: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain('importer');
  });

  it('refuses a pair whose merged file would exceed the LOC ceiling', () => {
    const fat = Array.from({ length: 130 }, (_, i) => `  readonly field${i}: number;`).join('\n');
    scaffold({
      'widget-types.ts': `export interface WidgetConfig {\n${fat}\n}\n`,
      'widget-engine.ts': `import type { WidgetConfig } from './widget-types';

export class WidgetEngine {
  public static fit(config: WidgetConfig): boolean {
    return config.field0 > 0;
  }
}
`,
    });

    const outcome = mergePair('widget', { dryRun: false, root, git: false });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/exceeds 120/);
    expect(readFileSync(join(root, MICRO, 'widget-engine.ts'), 'utf8')).toContain('widget-types');
    expect(existsSync(join(root, MICRO, 'widget-types.ts'))).toBe(true);
  });

  it('refuses a stem that is not a types file in microstructure', () => {
    scaffold(pairWithMultiLineImport());
    expect(mergePair('nonexistent', { dryRun: false, root, git: false }).ok).toBe(false);
  });
});
