# Code Review — Microstructure Type-File Consolidation

Date: 2026-10-25
Reviewed revision: `b7aba5f..HEAD` (11 commits) on branch
`feat/quantlib-microstructure-type-consolidation`
Baseline SHA: `b7aba5f7c44fe588c73e7be50a348341a1bdc9e6`
Mode: `--pending` resolved to the branch diff, since the working tree holds no reviewable
change (only another session's unstaged `agent-memory` file).

155 files changed, but the reviewable *logic* is 4 files totalling 1,046 lines. The other 151
are mechanical merge output, verified by command rather than by reading:

- `scripts/count-type-importers.mjs` (206 lines) — the safety gate
- `scripts/merge-microstructure-types.mjs` (241 lines) — the merge engine
- `test/scripts/count-type-importers.test.ts` (318 lines)
- `test/scripts/merge-microstructure-types.test.ts` (281 lines)

Every finding below is either reproduced by a command in this report or explicitly marked as a
reasoned judgement. No finding rests on reading alone.

## Verdict

**No Critical or Important findings.** Two Minor findings, neither blocking. The consolidation
is safe to ship.

## What was verified by command, not by reading

| Claim | Result |
|---|---|
| All 57 deleted types files had **0 value exports** (pure `interface`/`type`/`enum`) | 0 of 57 — the text-concatenation design rests on this, and it holds for every pair, not only the ones unit-tested |
| All **144** export declarations from the 57 deleted files are present in the surviving consumer, with **no** leftover `./<stem>-types` specifier anywhere | 0 problems across 57 files / 144 declarations |
| The 6 remaining `-types.ts` files are exactly the blocked set (by name, not count) | exact match |
| No production file exceeds 120 LOC; largest is 103 | confirmed |
| `public-sdk.ts` unchanged (0-line diff against baseline) | confirmed |
| Three engines showing two value-level declarations (`biais-lob-dynamics`, `cont-kukanov-ofi`, `stoll-spread`) introduced none — all three are pre-existing private helpers (`const TYPES`, `function cov`, `function computeLevelOfi`) | confirmed by per-file diff against baseline |
| Every one of the 57 real consumers contained the specifier **exactly once**, so the statement locator never had to disambiguate a real file | 0 of 57 |

The last row is why the locator's failure paths were never hit in production. Its guards were
therefore reviewed as defence-in-depth, and probed rather than trusted.

## Findings

### Minor 1 — the statement locator can be fooled by prose, and only the post-merge scan closes it

`findImportStatement` (`scripts/merge-microstructure-types.mjs:36-58`) locates the statement by
the **first line containing the specifier**, then walks backwards for an opener. A specifier
quoted in prose above the real import defeats that walk: the walk lands on the comment line,
which carries `from '...'`, and the self-contained check at line 54 passes — so the function
returns a range covering the comment rather than the import.

Traced on the fixture `// migrated from './widget-types'` above the real import:

```
specifier first seen at line index 0  =>  "// migrated from './widget-types' in an earlier revision"
backward walk settled at start = 0    =>  the same comment line
opener test on that line: false
self-contained check passes: true
```

The merge still **refuses**, and the consumer survives byte-for-byte:

```
{"stem":"widget","ok":false,"reason":"post-merge consumer still references ./widget-types"}
interfaces appended: false
```

That refusal comes from the post-merge specifier scan at line 177 — **not** from the
self-contained check. So the tree is safe today, but by a different mechanism than the code's
comment suggests, and the two are independently testable:

```
self-contained check deleted     -> merge suite 11/11 green (no test depends on it)
post-merge specifier scan deleted -> merge suite 1/11 red, and it is the case added in this review
```

Three further variants — indented prose, prose with a real `export` above it, and prose
containing the word `from` — all close the same way: `ok=false`, nothing appended, nothing
deleted. In every variant the types file survives on disk, so nothing is destroyed.

Consequence: a future merge against a consumer that mentions its own specifier in prose would
report a failure rather than corrupt a file. The failure is loud and recoverable, which is why
this is Minor rather than Important. It still matters for the recorded follow-up:
`src/tree/quantlib/execution/` holds about 37 type files, and a prose mention there is plausible.

Fix applied: one case in `test/scripts/merge-microstructure-types.test.ts` that pins the real
mechanism — the refusal, the reason, the surviving types file, and a byte-exact consumer. It is
verified in both directions: green on unmutated code, the sole failure when the post-merge scan
is deleted. `Minor 1` needs no further production change.

### Minor 2 — file-level doc comments are relocated, not preserved as file headers

Three types files (`admati-pfleiderer`, `grossman-stiglitz`, `ohara-oldfield-inventory`) carry
a file-level `/** ... */` block. `extractExportBlocks` attaches those lines to the first
export block's JSDoc chain, so they survive — but they land *below* the class instead of at the
top of the file. Verified in `admati-pfleiderer-engine.ts:31`, where the module header now sits
above `export interface AdmatiPfleidererPeriodInput`:

```
export class AdmatiPfleidererEngine { ... }
...
 * Admati & Pfleiderer (1988) Volume Clustering & Sunshine Trading Types
 * Reference: Anat R. Admati & Paul Pfleiderer (1988), RFS
 */

export interface AdmatiPfleidererPeriodInput {
```

The information is retained and the file still compiles and passes coverage, so this is a
documentation-placement nit, not a defect.

## Guards confirmed covered

Mutating each safety guard removes it and re-running the suite:

| Mutation | Effect | Tests that catch it |
|---|---|---|
| scan roots lose `test/` | a stem with a `test/` consumer is misclassified `safe-clean` | **2** — `finds test/ consumers...`, `treats a -queue consumer...` |
| drop the backward statement walk | multi-line statements are not removed whole | **5** |
| disable the 120 LOC ceiling | oversized merges are written | **1** — `refuses a pair whose merged file would exceed the LOC ceiling` |
| exact-basename → suffix matching | attempted; crashed at import time, so not a valid signal | — |

Every script or file touched by a mutation was restored and re-verified byte-identical against a
snapshot taken before the mutation (`diff -q` clean each time). No mutated state survives in the
tree; `git status` shows only the other session's unstaged `agent-memory` file.

The `test/`-consumer mutation is the one that matters most: it reproduces the Critical finding
from the plan's red-team review, and it is now caught by two assertions, which is what makes the
gate trustworthy rather than merely plausible.

## Recommendation

Ship as-is. Minor 1 is fixed by the test case added in this review (no production change), so
nothing is left outstanding for this plan; the reason to fix it now is that the merge script is
intended to be reused on `src/tree/quantlib/execution/`, where a consumer mentioning its own
specifier in prose is plausible and the failure would otherwise be unexplained. Minor 2 needs no
action for this plan — worth one line in the script's header so the relocation reads as a
documented choice rather than an accident.

One improvement to carry into that follow-up rather than this ship: make `findImportStatement`
match the statement by locating a line that both *contains* the specifier and *opens* with
`import`/`export` equally, instead of accepting the first line that contains the specifier. That
removes the prose case at the source instead of downstream of it.
