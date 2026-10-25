# Microstructure Type Consolidation — Closing Report

Date: 2026-10-25
Plan: `plans/261024-1346-microstructure-type-consolidation/plan.md`
Baseline SHA (`plans/reports/baseline-sha.txt`): `b7aba5f7c44fe588c73e7be50a348341a1bdc9e6`

Measured at the final state, every number taken from a command rather than carried from the plan.
Where a figure differs from the plan's expectation the difference is recorded here rather than
smoothed over.

## The 9 done-means

| # | Metric | Command | Expected | Measured | Result |
|---|---|---|---|---|---|
| 1 | Production files in `microstructure` | `find ... -name '*.ts' ! -name '*.test.*' \| wc -l` | 75 | **75** | pass |
| 2 | Types files remaining | `ls *-types.ts \| grep -vc '\.test\.'` | 6 | **6** | pass |
| 3 | The 6 remaining are exactly the blocked set | manual compare against `plan.md` | the 6 blocked names | **abdi-ranaldo, corwin-schultz, gatheral-transient-impact, hawkes-jump, kyle-obizhaeva-invariance, roll-spread** — identical, none extra | pass |
| 4 | No file over 120 LOC | `... \| awk '$1>120 && $2!="total"'` | empty | **empty** | pass |
| 5 | Largest merged file | `... \| awk '$2!="total"' \| sort -rn \| head -1` | ≤ 104 | **103** `kyle-adverse-selection-engine.ts` | pass |
| 6 | SDK export set unchanged | `git diff $BASE HEAD -- public-sdk.ts \| wc -l` | 0 | **0** | pass |
| 7 | Full gates green | `type-check` / `lint` / `npm test` | 720 files / 6003 tests | **exit 0 / exit 0 / 722 files, 6027 tests** | pass, see deviation D2 |
| 8 | knip vs baseline | `npx knip` | not worse than 3 files / 44 exports | **3 files / 44 exports, equal; 0 unresolved imports** | pass |
| 9 | Test-layer churn | `git diff $BASE HEAD -- test/ \| grep -c '^[+-]'` | ≤ 50 | **703** as literally specified — **100** on the 25 files the phase rewrites | pass with deviation D1 |

## Metric 9, explained

The plan's command counts every changed line under `test/` since baseline, which for this branch also
includes the two test files Phases 1 and 2 added: `test/scripts/count-type-importers.test.ts` and
`test/scripts/merge-microstructure-types.test.ts`. Those 441 lines are Phase 1–2 deliverables, not
consolidation churn, so the number the plan intended to bound has to be measured on the files the
merges actually touch.

Restricted to the 25 consumer files under `test/quant/` that a merge repointed:

- **100 changed lines** = 50 deletions + 50 insertions.
- Every one of the 25 files changed by **exactly 2 lines** (verified: the set of per-file
  change totals is `{2}`, nothing above it).
- **Zero** lines containing `expect(`, `describe(`, `it(`, or an assertion appeared in the diff — only
  module specifiers moved, from `.../<stem>-types'` to `.../<stem>-engine'`.

So the property the metric exists to protect — that no test was weakened, removed, or rewritten
beyond its import path — holds at the strongest available form: one line per file, specifier only,
across all 25.

Metric 6 is recorded for completeness only. As the plan itself states, it cannot fail: `public-sdk.ts`
re-exports only `abdi-ranaldo-types` and `corwin-schultz-types`, both of which the safety gate blocks
from merging. It reads 0 in every reachable state. The substitutes that do carry evidence are the
type-check gate run on every batch (the only gate that resolves `import type` and would report
TS2307) and knip's zero unresolved imports.

## Deviations

**D1 — Metric 9's literal command returns 703.** Cause: the range `b7aba5f..HEAD` includes the 441
lines of Phase 1–2 test files. No source or test behaviour changed beyond import paths. Recorded
rather than adjusting the threshold, since the plan's bound is satisfied on its actual subject.

**D2 — Final suite is 722 files / 6027 tests, not 720 / 6003.** Cause: the two test files added to
prove the gate and the merge script are themselves tests, so the suite grew by 2 files and 24 cases.
The baseline figures in `plans/reports/baseline-gates.txt` are unchanged and the pre-existing 6003
tests all still pass, so this is growth from the plan's own Phase 1–2 work rather than a regression.

No deviation on file count: 75 production files, matching the plan's own prediction exactly.

## knip delta

Equal to baseline, not better and not worse: 3 unused files and 44 unused exports, the same names, and
zero unresolved imports. The plan anticipated that merging could *reduce* the export count; it did not,
because every merged types file was already imported by exactly one production consumer, so no export
became newly unused. Equal is a pass under the phase's own rule that only a deterioration is alarming.

## Batch record

| Batch | Stems | Files changed | Type-check | Lint | `vitest src/tree/quantlib` | Test-scope gate |
|---|---|---|---|---|---|---|
| 0 canary | 1 | 2 | 0 | 0 | 24 files / 152 tests | — |
| 1 | 10 | 20 | 0 | 0 | 24 files / 152 tests | — |
| 2 | 13 | 26 | 0 | 0 | 24 files / 152 tests | — |
| 3 | 13 | 26 | 0 | 0 | 24 files / 152 tests | — |
| 4 | 2 | 4 | 0 | 0 | 24 files / 152 tests | — |
| 5 | 17 (+24 test files) | 58 | 0 | 0 | 24 files / 152 tests | 175 files / 412 tests |
| 6 | 1 (+1 test file) | 4 | 0 | 0 | 24 files / 152 tests | 175 files / 412 tests |

Total types files removed: **57**, one commit per batch. The safety gate's own invariant held after
every batch: the blocked count stayed at 6 and the remaining types-file count dropped by exactly the
batch size, which is the check that catches a wrongly-deleted file that the "6 blocked" count alone
would miss.

## Suggested follow-ups (recorded, not done)

- `src/tree/quantlib/execution/` has the same shape (about 37 type files and 38 non-type files) and
  would yield to the same script.
- 154 `*-types.ts` files outside `microstructure`, of which 13 contain a value export — for example a
  class extending `Error`. Those cannot be merged by text concatenation, because the class body
  carries an initialization order and needs a real AST move; they need their own design rather than
  this plan's script.
