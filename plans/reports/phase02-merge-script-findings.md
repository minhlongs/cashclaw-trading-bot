# Phase 2: Merge-Script — Measured Findings

Date: 2026-10-25
Plan: `plans/261024-1346-microstructure-type-consolidation/plan.md`
Phase: `phase-02-merge-script.md`

## What was built

- `scripts/merge-microstructure-types.mjs` — dry-run by default, `--write` to apply. Fails closed on
  importer count ≠ 1 and on a projected result over the 120 LOC ceiling.
- `test/scripts/merge-microstructure-types.test.ts` — 10 cases over `fs.mkdtempSync` scratch trees.

Both are green: `npx vitest run test/scripts/` → 2 files / 26 tests passing. Type-check and lint
both exit 0. `npx knip` matches baseline exactly (3 unused files / 44 unused exports / 3 duplicate
exports / 6 configuration hints), with no unresolved imports.

## Corrections to the plan's stated figures

### 1. Multi-line import statements: 10, not 7

The plan lists 7 pairs with a multi-line `import type {` statement
(`kyle-adverse-selection`, `kyle-lambda`, `stoikov-microprice`, `cont-kukanov-placement`,
`cont-delarrard-queue`, `glosten-harris-spread`, `cont-stoikov-lob`).

Measured by walking each consumer's lines back from the specifier line to the statement opener, there
are **10**. Three more use a bare `import {` rather than `import type {`:

| Pair | Opener | Lines |
|---|---|---|
| `admati-pfleiderer` | `import {` | 5 |
| `grossman-stiglitz` | `import {` | 4 |
| `ohara-oldfield-inventory` | `import {` | 4 |

This matters because the plan's LOC estimates for those three pairs assume a 1-line statement. With
the correct 4–5 lines the projections drop by 3–4 lines each, which is favourable, but a strip pattern
written only for `import type {` would have left three dangling statements in the tree. The merge
script matches `import` and `import type` alike.

### 2. Projected LOC for the multi-line pairs

Dry-run projections from the merge script, measured rather than derived from the plan's estimates:

| Pair | Statement lines | Projected merged LOC |
|---|---|---|
| `kyle-adverse-selection` | 3 | **104** (largest, unchanged) |
| `cont-kukanov-placement` | 4 | 97 |
| `kyle-lambda` | 5 | 83 |
| `admati-pfleiderer` | 5 | 60 |
| `grossman-stiglitz` | 4 | 42 |
| `ohara-oldfield-inventory` | 4 | 46 |

All 57 mergeable pairs project under 120; the maximum is 104, agreeing with the plan. The three
plain-`import` pairs are well under their earlier estimates because a 4–5 line statement is stripped,
not 1.

### 4. `kyle-adverse-selection` merged size: 103 or 104, depending on the counting convention

The plan records **104** (`83+23−3+1`). Merging the real pair in a scratch tree produces a file that
is **103** lines counting content and **104** lines as `wc -l` reports it, because `wc -l` counts the
final newline. The plan's figure is the `wc -l` number and stands; what the script now guarantees is
that its own projection equals the file it writes under a single stated convention, and that the
ceiling check uses the conservative one. A merge landing at exactly 120 would be caught either way,
since the script refuses at `> 120`.

### 3. The LOC projection formula in the script

Two iterations of the projection were wrong before the emitted file matched the estimate, and both
errors were invisible because the estimate was only ever compared against a constant. The script now
derives the projection from the same quantities the append writes:

```
projected = lines(body) + 1 + lines(blocks joined by '\n\n')
```

A test asserts `projected === actual line count of the written file`, so the ceiling check cannot
silently drift from what the merge produces again.

## Defects found and fixed during the phase

- **Blocks emitted without a blank separator.** The extractor's backward walk over JSDoc stopped at
  the previous anchor, so the second block kept the source file's separating blank line as a *leading*
  newline and the join produced none. Fixed by trimming both ends of each block and letting the join
  supply exactly one separator.
- **`collectSourceFiles` ignored its `root` argument.** The counter closed over a module-level root,
  so `countImporters(tempRoot)` scanned the real repository for importers while reading the temp
  directory for stems. This is the class of bug the whole gate exists to prevent: it made a scratch
  fixture look like a single-importer pair. The parameter is now threaded through.
- **The merge script resolved the consumer against the real root.** `join(ROOT, consumerRel)` instead
  of `join(root, consumerRel)` meant the first `--write` test run edited
  `src/tree/quantlib/microstructure/roll-spread-engine.ts`, appending the fixture's `WidgetConfig` and
  `WidgetResult` interfaces and deleting its import line. The file was restored with `git checkout`
  and verified byte-identical to HEAD; `git status --short src/` is empty and the counter again reports
  the six expected blocked stems. This is why the tests are required to run on `mkdtempSync` trees.
- **Statement-absent handling.** After a successful merge the consumer no longer references the types
  file, so the counter reports zero importers and a retry correctly refuses. The script reports this
  as a refusal rather than silently re-appending, and the tests assert the file is left untouched.

## Trial merge (plan step 6–8)

`roll-implicit-spread`, the smallest pair (11-line types file, 19-line engine):

- projected 29 lines; written file is 29 lines.
- Import statement removed, both interfaces appended with a blank separator, types file `git rm`'d.
- `npm run type-check` exit 0; `npm run lint -- --max-warnings 0` exit 0;
  `npx vitest run src/tree/quantlib` → 24 files / 152 tests passing.
- `npx knip` reports no unresolved imports for the pair.

Reverted per plan step 9. `git status --short src/` empty; `git clean -nd
src/tree/quantlib/microstructure/` empty.

## Gate status

| Check | Result |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run lint -- --max-warnings 0` | exit 0 |
| `npx vitest run test/scripts/` | 2 files / 26 tests passing (file count > 0) |
| `npx vitest run src/tree/quantlib` (trial) | 24 files / 152 tests passing |
| `npx knip` | matches baseline, no unresolved imports |
| `git status --short` (src/) | empty after revert |
| Trial diff | exactly the 4 expected changes, no foreign lines |
