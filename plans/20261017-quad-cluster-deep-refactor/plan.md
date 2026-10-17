# Plan: Quad-Cluster Deep Refactor (SaaS API DRY, 7 Production Hotspots <= 140 LOC, Test Monoliths)

**Date:** 2026-10-17
**Brainstorm Report:** `plans/reports/20261017-deep-refactor-hotspot-and-saas-dry-brainstorm-report.md`
**Status:** Completed

## Brainstorm Contract Summary
- **Outcome:**
  1. Unify SaaS workspace/tier/active-bot resolution into `src/ee/tenancy/workspace-request-context.ts` and fix `POST /api/ee/credits` (IPN tier lookup when `tier` omitted) and `POST /api/ee/sync` (fallback to live `botListHandler()` count).
  2. Decompose the 7 largest production files in `src/` (`177–196 LOC`) into single-responsibility modules strictly `<= 140 LOC`, lowering the repo-wide production ceiling to `159 LOC`.
  3. Slice the top 2 test monoliths (`src/__tests__/e2e-smoke.test.ts` and `src/forest/research/tradingagents/debate-to-hypothesis.test.ts`) below `250 LOC`.
- **Constraints:** `PAPER/BACKTEST ONLY`, preserve all public exports and route contracts, `0 :any`, `0 console.log`, `0 eslint-disable`.

## Phases

| Phase | Title | Target Files | Status |
|---|---|---|---|
| **Phase 01** | [SaaS Context DRY & Runtime State Fix](./phase-01-saas-context-dry-and-store-split.md) | `workspace-request-context.ts`, `saas-entitlement-store.ts`, `saas-entitlement-d1.ts`, 4 API routes | Completed |
| **Phase 02** | [Quant & Strategy Visualizer Modularization](./phase-02-quant-and-strategy-ui-modularization.md) | 6 UI components (`177–196 LOC`) + extracted `*-model.ts` / sub-components | Completed |
| **Phase 03** | [Test Monolith Slicing & Quality Gate Verification](./phase-03-test-monolith-slicing-and-verification.md) | `e2e-smoke*.test.ts`, `debate-to-hypothesis*.test.ts`, full suite + OSS audit | Completed |
