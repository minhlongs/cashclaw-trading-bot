#!/usr/bin/env node
// Read-only safety gate for the microstructure type-file consolidation.
//
// Counts, for every `src/tree/quantlib/microstructure/*-types.ts`, how many files import it,
// split by production vs test. The merge is only allowed when the production importer count is
// exactly one. This script writes nothing; it prints a report and exits non-zero if the four
// classification groups do not account for every types file, so a misclassification cannot pass
// silently.
//
// Matching rules that are load-bearing:
//   - The repository root is scanned in full (src/, test/, tests/, bin/, root *.config.ts). Test
//     files are real consumers: tsconfig.json includes them in tsc --noEmit, and vitest.config.ts
//     collects them. Excluding them is the error this gate exists to prevent.
//   - Importers are matched by exact basename equality. `stoll-spread-types` is a genuine suffix of
//     `huang-stoll-spread-types`, so a suffix test would invent an importer that does not exist.
//   - A multi-line `import type {` ... `} from '...'` is one statement, not several. Counting
//     `from '...'` clauses achieves this without parsing statements.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Roots scanned for importers. `test/` is deliberately included.
const SCAN_ROOTS = ['src', 'test', 'tests', 'bin'];

const IMPORT_SPECIFIER = /(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectSourceFiles(scanRoot) {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(scanRoot, root);
    if (!existsSync(abs)) continue;
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) files.push(full);
      }
    };
    walk(abs);
  }
  for (const entry of existsSync(scanRoot) ? readdirSync(scanRoot) : []) {
    if (/\.config\.(ts|mts|cts)$/.test(entry)) {
      const full = join(ROOT, entry);
      if (statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}

function isTestFile(relPath) {
  return (
    relPath.startsWith('test/') ||
    relPath.startsWith('tests/') ||
    /\.test\./.test(relPath) ||
    /\.spec\./.test(relPath)
  );
}

// Strip a trailing extension and directories to get the module's basename.
function specifierBasename(specifier) {
  const last = basename(specifier);
  const ext = extname(last);
  return ext ? last.slice(0, -ext.length) : last;
}

export function countImporters(root = ROOT) {
  const microDir = join(root, 'src/tree/quantlib/microstructure');
  if (!existsSync(microDir)) {
    throw new Error(`expected directory not found: ${microDir}`);
  }

  const stems = readdirSync(microDir)
    .filter((name) => name.endsWith('-types.ts'))
    .map((name) => name.slice(0, -'-types.ts'.length))
    .sort();

  // Importers keyed by the types-file basename, e.g. 'kyle-adverse-selection-types'.
  const importersByTarget = new Map();
  for (const stem of stems) importersByTarget.set(`${stem}-types`, []);

  const files = collectSourceFiles(root);
  for (const file of files) {
    const rel = relative(root, file);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const seenTargets = new Set();
    for (const pattern of [IMPORT_SPECIFIER, DYNAMIC_IMPORT]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const target = specifierBasename(match[1]);
        if (importersByTarget.has(target) && !seenTargets.has(target)) {
          seenTargets.add(target);
          importersByTarget.get(target).push({ file: rel, specifier: match[1] });
        }
      }
    }
  }

  const result = {
    blocked: [],
    safeWithTest: [],
    safeClean: [],
    noEngine: [],
    stems,
    importers: {},
  };

  for (const stem of stems) {
    const target = `${stem}-types`;
    const all = importersByTarget.get(target);
    const production = all.filter((entry) => !isTestFile(entry.file));
    const test = all.filter((entry) => isTestFile(entry.file));
    const hasEngine = existsSync(join(microDir, `${stem}-engine.ts`));
    const hasQueue = existsSync(join(microDir, `${stem}-queue.ts`));

    result.importers[stem] = {
      production: production.map((e) => e.file),
      test: test.map((e) => e.file),
      hasEngine,
      hasQueue,
    };

    // Precedence is load-bearing: a file with >=2 production importers must never be reported as
    // mergeable, even when it also lacks an -engine.ts sibling. `gatheral-transient-impact-types`
    // and `hawkes-jump-types` are exactly that shape, so the blocked check has to come first.
    if (production.length >= 2) result.blocked.push(stem);
    else if (!hasEngine && !hasQueue) result.noEngine.push(stem);
    else if (production.length === 1 && test.length > 0) result.safeWithTest.push(stem);
    else result.safeClean.push(stem);
  }

  return result;
}

function main() {
  const result = countImporters();
  const classified =
    result.blocked.length +
    result.safeWithTest.length +
    result.safeClean.length +
    result.noEngine.length;

  console.log(`types files found: ${result.stems.length}`);
  console.log(`  blocked        (>=2 production importers): ${result.blocked.length}`);
  console.log(`  safe-with-test (1 production + test):     ${result.safeWithTest.length}`);
  console.log(`  safe-clean     (1 production, none test): ${result.safeClean.length}`);
  console.log(`  no-engine      (no -engine/-queue sibling): ${result.noEngine.length}`);
  console.log(`  classified total: ${classified}`);

  if (result.blocked.length) {
    console.log('\nblocked:');
    for (const stem of result.blocked) {
      console.log(`  ${stem}-types`);
      for (const f of result.importers[stem].production) console.log(`      production: ${f}`);
      for (const f of result.importers[stem].test) console.log(`      test:       ${f}`);
    }
  }

  if (result.noEngine.length) {
    console.log('\nno engine/queue sibling:');
    for (const stem of result.noEngine) {
      console.log(`  ${stem}-types -> ${result.importers[stem].production.join(', ') || '(none)'}`);
    }
  }

  if (result.safeWithTest.length) {
    console.log('\nsafe-with-test (test files to rewrite):');
    for (const stem of result.safeWithTest) {
      console.log(`  ${stem}-types`);
      for (const f of result.importers[stem].test) console.log(`      ${f}`);
    }
  }

  const problems = [];
  if (classified !== result.stems.length) {
    problems.push(
      `classification total ${classified} != types file count ${result.stems.length}`
    );
  }
  const overlaps = [result.blocked, result.safeWithTest, result.safeClean, result.noEngine]
    .flat()
    .filter((stem, index, all) => all.indexOf(stem) !== index);
  if (overlaps.length) {
    problems.push(`stems classified more than once: ${overlaps.join(', ')}`);
  }

  if (problems.length) {
    console.error('\nFAIL: ' + problems.join('; '));
    process.exit(1);
  }
  console.log('\nOK');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
