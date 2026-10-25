# Microstructure Type-File Consolidation (132 → 75 files)

## Objective
Merge the 57 single-importer `*-types.ts` files in `src/tree/quantlib/microstructure/` into their
sole consuming engine/queue module, cutting directory file count with zero behavior change.

## Done means
- production files 132 → 75; exactly 6 `-types.ts` remain, matching the blocked set by name
- 0 files >120 LOC; largest merged file 103
- type-check 0, lint 0, suite 722 files / 6,028 tests
- knip equal to baseline (3 unused files / 44 exports, 0 unresolved imports)
- `public-sdk.ts` unchanged (0-line diff)

## What changed
Two scripts: `scripts/count-type-importers.mjs` gates the merge by scanning `src/`, `test/`,
`tests/`, `bin/` and matching specifiers by **exact basename equality**; suffix matching breaks on
`stoll-spread` vs `huang-stoll-spread`. Group precedence is load-bearing — `blocked` must be
evaluated before `no-engine`, otherwise two stems with 2 production importers and no engine sibling
would fall through as mergeable. `scripts/merge-microstructure-types.mjs` concatenates the type
blocks onto the consumer and strips the import statement by walking backwards from the specifier
line to the opener, because ten pairs open with a bare `import {` closing several lines later.

## The tricky bit
Text concatenation is safe here only because every merged type file is pure `interface`/`type`/
`enum` — verified across all 57, 0 value exports, so no initialization order is introduced. The
statement locator is the fragile part: a specifier quoted in a comment above the real import makes
the walk land on the comment, and the merge only refuses because of the post-merge specifier scan,
not the self-contained check. That path is now pinned by a test.

## Deviations
D1 — the plan bounded test-layer churn at 50 lines; the literal command measures 703 because the
range includes the 441 lines of the Phase 1–2 test files. On the 25 consumer files the merges
actually repoint, it is 100 lines, exactly 2 per file, with zero assertions touched.
D2 — the suite is 722 files / 6,028 tests rather than 720 / 6,003, because the plan's own Phase 1–2
deliverables are tests.

## Next
`src/tree/quantlib/execution/` has the same shape (about 37 type files) and would take the same
script. 154 `*-types.ts` files sit outside microstructure, of which 13 contain a value export and
need a real AST move rather than concatenation.
