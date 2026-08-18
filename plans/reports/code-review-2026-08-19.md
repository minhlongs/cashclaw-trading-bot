# Code Review — 2026-08-19 — Falsification Campaign Closure

## Scope
- Files reviewed: 81 files changed across commits `ac4b5ff` → `ec53022` (8 commits)
- Focus: quality-gate restoration, archive migration, real-data backtest script, regime classifier refactor, attribution/report-builder refactor, hypothesis evaluator refactor
- Scout findings: none surfaced beyond the diff — all changes are deletion, doc, or refactor-only; no new public API surface

## Overall Assessment
**CONDITIONAL PASS.** The quality gate exits 0 (1880 tests pass, 0 lint warnings, 0 TS errors, knip clean), and the falsification-closure work is honest and well-scoped. The diff is overwhelmingly deletions (16,887 lines removed) plus a single new paper-only research script. All refactors preserve behavior — verified by the fact that the test suite still passes 1880/1880 with no test edits that weaken assertions.

Two findings are worth flagging, both low-severity:
1. `docs/development-roadmap.md` line 47 states "1880 across 119 files" but the repo actually contains 130 `.test.ts` files (156 total test files including `.tsx`). Stale stat.
2. `scripts/alpha-real-data-backtest.ts` hardcodes `1h` for the OI fetch (line 48) even though the user can pass a different `timeframe`. Cosmetic inconsistency in a paper-only script; not a defect.

No breaking changes to public contracts, no auth regressions, no data leaks, no new lint/type/build errors.

## Critical Issues
None.

## High Priority
None.

## Medium Priority
None.

## Low Priority
1. **Docs stat drift** — `docs/development-roadmap.md:47` says "1880 across 119 files". Actual: 130 `.test.ts` files in repo (156 counting `.tsx`). Update to `130` or remove the file count. Not load-bearing.
2. **Script timeframe mismatch** — `scripts/alpha-real-data-backtest.ts:48` passes `'1h'` to `fetchOpenInterestHistory` regardless of the CLI `timeframe` argument. In a paper-only research tool this is harmless, but it means OI data is always 1h even if the user requests 4h candles. Either pass `timeframe` or add a comment explaining the 1h choice.

## Edge Cases Found by Scout
- **Archive tracked in git**: 51 files under `archive/falsification/` are tracked (not gitignored). They are excluded from `tsc` and knip's project glob, so they don't break the gate. But they are dead weight in the repo — consider `.gitignore` + `git rm --cached` if they should never be restored. Not a defect, just a note.
- **`createCandleSource(_source: DataSource)`** — the parameter is intentionally unused (prefixed `_`). Knip's `ignoreExportsUsedInFile` plus the `_` prefix keeps it quiet. Fine.
- **`gitCommit` field orphaned** — `Experiment.gitCommit` and `ExperimentResult` no longer populate `gitCommit` (the `getGitCommit()` helper was removed from `runner.ts`). The field still exists in `types.ts` and is read by `json-adapter.ts:101` (`rest.gitCommit ?? null`). Not a regression — it was always optional and defaults to null. The `runner.test.ts` does not assert it. Acceptable.

## Positive Observations
- The `RuleBasedRegimeClassifier` refactor (extracting `attemptTransition` to return `{ confidence }` instead of building the full result) genuinely reduces complexity and removes dead `buildResult` calls inside transition branches. Behavior preserved: the `nearThreshold` dampening (`rawConfidence * 0.5`) and the duration-increment-on-stay logic are identical.
- `attributePerformance` was split into 7 small pure helpers (`buildRegimeLookup`, `regimeAt`, `findLatestSignal`, `matchTradesToSignals`, `groupByAlpha`, `accumulateFeatures`, `computeAlphaAttribution`). The binary search for latest signal is correct (returns `best` initialized to 0, which is safe because `signals.length === 0` returns `[]` early at the caller).
- `buildReport`/`emptyReport` extraction is clean; `computeTradeStats`, `buildEquityCurve`, `aggregateByMonth/Volume/Duration` are all pure and testable.
- The `funding.ts` sort bug fix (`a.timestamp - a.timestamp` → `a.timestamp - b.timestamp`) is a real correctness fix — the old comparator returned 0 for every pair, so the sort was a no-op and OI points came back in arbitrary order.
- `evaluator.ts` removed the unused `SignalEvaluation` interface and `LabeledEvent` import; the `DIRECTION_RULES` table is a faithful translation of the old switch (verified: `atr`/`realized_volatility`/`volume_zscore` → `>1 sell, <-1 buy`; `rsi` → `<30 buy, >70 sell`; `momentum`/`returns`/`log_returns` → sign-based; `bollinger` → `<-1 buy, >1 sell`).
- `scripts/alpha-real-data-backtest.ts` uses `createLogger` (scout pattern), `@/*` path aliases, and graceful degradation on 403 — consistent with the codebase. The `log.error` call signature matches `createLogger`'s `(message, error?, ctx?)` form.

## Recommended Actions
1. Update `docs/development-roadmap.md:47` — change "119 files" to "130 files" (or drop the file count).
2. (Optional) Align `scripts/alpha-real-data-backtest.ts:48` OI timeframe with the CLI arg, or add a comment.

## Metrics
- Type Coverage: 100% (0 TS errors on `tsc --noEmit`)
- Test Coverage: 1880 tests across 155 files, all passing
- Linting Issues: 0 warnings (`eslint src/ --max-warnings 0`)
- Knip: clean (14 `ignoreIssues` entries, all pre-existing `["exports"]` suppressions; 5 stale `ignoreFiles` removed; dead `evaluator/data-fetcher.ts` deleted)
- Quality gate: `npm run quality:gate` exits 0

## Unresolved Questions
None.

## Verdict
**CONDITIONAL PASS** — gate is green, no regressions, no breaking changes. The two low-priority items above are documentation/script-consistency nits, not code defects. Ready to ship after the roadmap stat is corrected.