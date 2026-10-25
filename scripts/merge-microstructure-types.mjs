#!/usr/bin/env node
// Mechanically merge a microstructure `<stem>-types.ts` into its single consumer.
//
// Dry-run by default; `--write` appends the type blocks to the consumer, strips the import
// statement that referenced the types file, and `git rm`s the types file. It refuses to run unless
// the importer count is exactly one, and refuses to write a consumer over the 120 LOC ceiling.
//
// Why text concatenation instead of an AST: every type file in microstructure is pure type and
// interface with no value export, so there is no initialization order or side effect to preserve.
// The one thing that does need care is the import statement itself — ten pairs open it with a bare
// `import {` or `import type {` and close it on a later line, so a single-line pattern silently
// leaves the statement (or half of it) behind. The statement is therefore located from its opener
// through the line carrying the specifier, and removed whole.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { countImporters } from './count-type-importers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOC_CEILING = 120;

// The opener of a statement that consumes the types file. `import` deliberately also matches
// `import type`, because three pairs (admati-pfleiderer, grossman-stiglitz, ohara-oldfield-inventory)
// import pure types through a bare `import {` under `isolatedModules`.
const OPENER = /^\s*(?:import|export)\b/;

function countLines(text) {
  const trimmed = text.replace(/\n+$/, '');
  return trimmed === '' ? 0 : trimmed.split('\n').length;
}

// Locate the statement that references `<stem>-types` and return its physical line range.
// Returns null when the consumer does not reference it (already merged, or a different consumer).
function findImportStatement(consumerText, stem) {
  const lines = consumerText.split('\n');
  const target = `./${stem}-types`;

  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(target)) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  let start = end;
  while (start > 0 && !OPENER.test(lines[start])) start -= 1;
  if (start !== 0 && !OPENER.test(lines[start])) return null;

  // Sanity: the statement must be self-contained between open and close.
  const opener = lines[start];
  if (!/from\s*['"]/.test(opener) && !/from\s*['"]/.test(lines[end])) return null;

  return { start, end, statement: lines.slice(start, end + 1).join('\n') };
}

// Split a types file into top-level export blocks, each keeping any JSDoc immediately above it.
// Three of the 63 type files carry a file-level doc comment; those lines are pulled in with the
// block they document rather than being dropped.
// Trim blank lines from both ends of a block so the caller controls the separator.
function trimBlank(lines) {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === '') from += 1;
  while (to > from && lines[to - 1].trim() === '') to -= 1;
  return lines.slice(from, to).join('\n');
}

function extractExportBlocks(typesText) {
  const lines = typesText.split('\n');
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^export\s+(?:interface|type|enum)\b/.test(lines[i])) anchors.push(i);
  }

  const blocks = [];
  for (let a = 0; a < anchors.length; a++) {
    // The block runs from its own `export` line to the line before the next one. Walking the start
    // backwards over JSDoc stops at the previous anchor, so a predecessor's body can never be pulled
    // in, and the remainder is trimmed in both directions so the separator between blocks is supplied
    // by the join rather than by whatever spacing the source file happened to use.
    const floor = a > 0 ? anchors[a - 1] : -1;
    let from = anchors[a];
    while (from > floor + 1 && lines[from - 1].trim() === '') from -= 1;
    while (from > floor + 1 && /^\s*(\/\*\*|\*|\/\/)/.test(lines[from - 1])) from -= 1;

    const to = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
    blocks.push(trimBlank(lines.slice(from, to)));
  }
  return blocks;
}

// `root` is injectable so tests can point this at a scratch tree instead of the real `src/`.
export function mergePair(stem, { dryRun, root = ROOT, git = true, subDir = 'src/tree/quantlib/microstructure' }) {
  const microDir = join(root, subDir);
  const typesPath = join(microDir, `${stem}-types.ts`);
  if (!existsSync(typesPath)) return { stem, ok: false, reason: `types file not found: ${typesPath}` };

  // The counter is the single source of truth for mergeability, so a change to the classification
  // cannot silently diverge from what the gate permits.
  const result = countImporters(root, subDir);
  const entry = result.importers[stem];
  if (!entry) return { stem, ok: false, reason: `not a types file in ${subDir}: ${stem}` };
  if (result.blocked.includes(stem)) {
    return { stem, ok: false, reason: `blocked (${entry.production.length} production importers)` };
  }
  if (entry.production.length !== 1) {
    return { stem, ok: false, reason: `expected 1 production importer, found ${entry.production.length}` };
  }
  if (result.noEngine.length && !entry.hasEngine && !entry.hasQueue) {
    return { stem, ok: false, reason: 'no engine/queue sibling' };
  }

  const consumerRel = entry.production[0];
  const consumerPath = join(root, consumerRel);
  const consumerText = readFileSync(consumerPath, 'utf8');
  const typesText = readFileSync(typesPath, 'utf8');

  const stmt = findImportStatement(consumerText, stem);

  const blocks = extractExportBlocks(typesText);
  const existing = new Set();
  for (const line of consumerText.split('\n')) {
    const m = /^export\s+(?:interface|type|enum)\s+(\w+)/.exec(line);
    if (m) existing.add(m[1]);
  }
  const missing = blocks.filter((b) => {
    const m = /^export\s+(?:interface|type|enum)\s+(\w+)/.exec(b.trim().split('\n')[0]);
    return !m || !existing.has(m[1]);
  });

  // No statement and nothing left to append means this pair is already merged. Reaching that state
  // is the normal outcome of a retry, so it is reported as a no-op rather than a failure.
  if (!stmt) {
    if (missing.length === 0) {
      return { stem, ok: true, dryRun, noop: true, reason: 'already merged' };
    }
    return {
      stem,
      ok: false,
      reason: `no import statement referencing ./${stem}-types in ${consumerRel}`,
    };
  }
  if (missing.length === 0) {
    return { stem, ok: true, dryRun, noop: true, reason: 'all blocks already present' };
  }

  // Remove the statement, then append what is missing after exactly one blank separating line.
  // Both ends are normalized first: dropping the statement leaves a leading blank line behind, and
  // trimming only the tail would emit a file that opens with a blank and has no separator before the
  // appended blocks.
  const withoutStatement = [
    ...consumerText.split('\n').slice(0, stmt.start),
    ...consumerText.split('\n').slice(stmt.end + 1),
  ].join('\n');
  const body = withoutStatement.replace(/^\n+/, '').replace(/\n+$/, '');

  // The append emits `body`, one blank line, then the blocks joined by blank lines — so the projection
  // is body + 1 + the joined blocks. Deriving it from `body` rather than `consumerText` keeps the
  // estimate honest when the statement sat at the top and left a leading blank line behind.
  const projected = countLines(body) + 1 + countLines(missing.join('\n\n'));
  if (projected > LOC_CEILING) {
    return {
      stem,
      ok: false,
      reason: `projected ${projected} LOC exceeds ${LOC_CEILING}`,
    };
  }

  const merged = body + '\n\n' + missing.join('\n\n') + '\n';

  // Idempotence guard: a second run must not duplicate anything. `missing` already filtered by name,
  // and the statement is gone, so re-running yields byte-identical output. Verify rather than assume.
  if (merged.includes(`./${stem}-types`)) {
    return { stem, ok: false, reason: `post-merge consumer still references ./${stem}-types` };
  }

  if (!dryRun) {
    writeFileSync(consumerPath, merged);
    // `git rm` stages the deletion; a scratch tree without a repository gets a plain unlink.
    if (git) execFileSync('git', ['rm', '-q', typesPath], { cwd: root, stdio: 'ignore' });
    else unlinkSync(typesPath);
  }

  return {
    stem,
    ok: true,
    dryRun,
    projected,
    statementLines: countLines(stmt.statement),
    blocksAdded: missing.length,
    consumer: consumerRel,
    removedStatement: stmt.statement.split('\n').slice(0, 2),
  };
}

function parseArgs(argv) {
  const args = { write: false, stems: [], subDir: undefined };
  for (const a of argv) {
    if (a === '--write') args.write = true;
    else if (a === '--dry-run') args.write = false;
    else if (a.startsWith('--dir=')) args.subDir = a.slice('--dir='.length);
    else if (a.startsWith('--stems=')) args.stems.push(...a.slice('--stems='.length).split(','));
    else args.stems.push(a);
  }
  return args;
}

function main() {
  const { write, stems, subDir } = parseArgs(process.argv.slice(2));
  if (stems.length === 0) {
    console.error('usage: node scripts/merge-microstructure-types.mjs <stem> [<stem> ...] [--write]');
    process.exit(2);
  }

  let failures = 0;
  for (const stem of stems) {
    const outcome = mergePair(stem, { dryRun: !write, subDir });
    if (!outcome.ok) {
      failures += 1;
      console.log(`FAIL  ${stem}: ${outcome.reason}`);
      continue;
    }
    const tag = outcome.noop ? 'SKIP' : write ? 'WRITE' : 'DRY  ';
    const extra = outcome.noop
      ? outcome.reason
      : `projected=${outcome.projected} blocks=${outcome.blocksAdded} stmt=${outcome.statementLines}L`;
    console.log(`${tag}  ${stem}  ${extra}`);
  }

  if (failures) {
    console.error(`\nFAIL: ${failures} of ${stems.length} stems rejected`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
