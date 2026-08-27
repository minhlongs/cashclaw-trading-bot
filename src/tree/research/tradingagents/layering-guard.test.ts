// Layering guard — the deliberation layer must stay tree-pure.
// Scoped to src/tree/research/tradingagents/ ONLY (per plan-verdict R1:
// NOT repo-wide). Enforces:
//   1. No value imports from @/forest/** (type-only `import type` allowed,
//      matching the existing hypothesis/types.ts convention).
//   2. No I/O or execution primitives (fetch, fs, child_process, eval,
//      new Function, dynamic import, require).
//   3. No console.* in production files.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = __dirname;

function productionFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(DIR, f));
}

/** Value imports from @/forest/** — `import type` is allowed. */
const FOREST_VALUE_IMPORT = /import\s+(?!type\b)[^;]*from\s+['"]@\/forest\//;

/** I/O or execution primitives forbidden in the tree layer. */
const FORBIDDEN_PRIMITIVES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\brequire\s*\(/, 'require()'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/from\s+['"]node:fs['"]/, 'node:fs import'],
  [/from\s+['"]node:child_process['"]/, 'node:child_process import'],
  [/from\s+['"]child_process['"]/, 'child_process import'],
  [/\bconsole\.(log|warn|error|info|debug)\s*\(/, 'console.* call'],
];

describe('layering guard — tradingagents tree purity', () => {
  it('has production files to guard', () => {
    expect(productionFiles().length).toBeGreaterThanOrEqual(11);
  });

  it('never value-imports from @/forest/** (type-only allowed)', () => {
    for (const file of productionFiles()) {
      const content = readFileSync(file, 'utf-8');
      expect(FOREST_VALUE_IMPORT.test(content), `${file} value-imports @/forest/**`).toBe(false);
    }
  });

  it('contains no I/O or execution primitives', () => {
    for (const file of productionFiles()) {
      const content = readFileSync(file, 'utf-8');
      for (const [pattern, label] of FORBIDDEN_PRIMITIVES) {
        expect(pattern.test(content), `${file} contains ${label}`).toBe(false);
      }
    }
  });
});
