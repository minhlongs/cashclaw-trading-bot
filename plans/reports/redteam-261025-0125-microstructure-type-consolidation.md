# Red-Team Review: Microstructure Type-File Consolidation

Date: 2026-10-25
Plan: `plans/261024-1346-microstructure-type-consolidation/plan.md`
Branch: `feat/quantlib-microstructure-type-consolidation`

## Method

Four adversarial reviewers (Assumption Destroyer / Failure Mode Analyst / Security Adversary /
Scope & Complexity Critic), plus an independent adjudication counter run by the controller when a
reviewer's result conflicted with the plan.

Two reviewer runs were lost to API errors (ECONNRESET) and a third ended with the session. Their
partial transcripts were recovered rather than re-run from zero, which surfaced the finding below.
**Claims are accepted only where the controller reproduced them with a command.**

## Findings

### 1. Accepted — plan's test-file account was wrong by one file (Important)

The plan's lô 5 table listed 24 test files over 17 pairs. Measured independently: **25** files over
18 pairs.

Cause: `cont-stoikov-lob` is the single mergeable pair with no `-engine.ts` sibling (its consumer is
`cont-stoikov-lob-queue.ts`). Because it sat outside the 56 engine pairs, its test consumer was never
counted — yet `test/quant/v13-full-suite-simulation.test.ts:3` imports
`cont-stoikov-lob-types`, so the file dangles on that batch too and lands in lô 6, not lô 5.

Evidence:

```
$ # independent counter: from '<spec>' clauses, exact basename equality, is_test by path
TOTAL: 63
SAFE_WITH_TEST: 18          # plan said 17

$ grep -n "cont-stoikov-lob-types" test/quant/v13-full-suite-simulation.test.ts
3:import type { LOBQueueSnapshot } from '../../src/tree/quantlib/microstructure/cont-stoikov-lob-types';

$ grep -n "v13" plans/261024-1346-microstructure-type-consolidation/phase-03-batch-merges.md
NOT PRESENT
```

Applied fixes:

- `plan.md` Done-means: 24 → **25** files, threshold 48 → **50** changed lines, with the
  lô 5 = 24 / lô 6 = 1 split made explicit.
- `plan.md` Evidence table: new row recording the 25-file count and why 24 was short.
- `phase-03`: table row, Success Criteria, Risk table, and the `v*` explanation (7 → 8 files).
- `phase-04` step 9: 48 → **50**.

The user's approved decision text is preserved verbatim inside the blockquote; only the clarifying
parenthetical changed.

### 2. Rejected — "`knip.json` `project: src/**` cannot see `test/`" (reviewer error)

A reviewer claimed knip's project scope proves the plan's knip gate cannot name test consumers, so
the gate is weaker than the plan asserts.

Reproduced instead: `project` limits what knip *analyzes*, not what it *resolves*. With
`stoikov-microprice-types.ts` removed and the engine left dangling, `npx knip` reported
`Unresolved imports (3)` naming all three consumers:

```
./stoikov-microprice-types                  …microstructure/stoikov-microprice-engine.ts:5:8
../../src/tree/quantlib/microstructure/stoikov-microprice-…  test/quant/stoikov-microprice-engine.test.ts:3:41
../../src/tree/quantlib/microstructure/stoikov-microprice-…  test/quant/v19-apex-suite-simulation.test.ts:5:41
```

The plan's claim holds, and this independently corroborates the two test consumers the plan predicts
for that pair. The tree was restored byte-identical after the probe (`diff` clean).

The plan now records the mechanism so the objection does not have to be re-litigated.

### 3. Rejected — REVIEWER's "missing NEWLINE and duplicate exported identifiers" claim (reviewer error)

A reviewer claimed `cont-kukanov-placement` was over budget with `imp=0` for a multi-line import.

Measured: `wc -l` gives 82 + 19, and the import statement spans 4 physical lines, so the correct
figure is 82 + 19 − 4 + 1 = **98**, under the ceiling and matching the plan.

## Non-findings verified and recorded

- All 7 multi-line import statements confirmed by direct byte inspection, matching the plan's counts
  exactly: `kyle-adverse-selection` 3, `kyle-lambda` 5, `stoikov-microprice` 5,
  `cont-kukanov-placement` 4, `cont-delarrard-queue` 4, `glosten-harris-spread` 4,
  `cont-stoikov-lob` 4.
- Max post-merge file is 104 LOC, which the plan and this review agree on.
- `tsx` is absent from `node_modules/.bin` and `package.json`; `.mjs` + `node` is the right choice.
- `vitest.config.ts` include is `src/**`, `test/**`, `tests/**`, `bin/**` — no `scripts/**`, so
  `vitest run scripts/` collects nothing and exits 0. Tests therefore belong in `test/scripts/`.

## Accepted-finding status

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Test-file account missing `v13` (25 not 24) | Important | **Applied to plan.md, phase-03, phase-04** |
| 2 | knip cannot see `test/` | — | Rejected — reproduced, plan correct |
| 3 | LOC formula wrong on multi-line pairs | — | Rejected — reproduced, plan correct |

## Gate conclusion

No unresolved contradiction remains. `ak plan validate` reports the plan directory valid.
Proceeding to implementation is permitted under the vibe pipeline's rule that validation failures,
accepted red-team findings, and unresolved contradictions must be cleared first.
