# Plan: Wave 2 Quad-Cluster Deep Refactor (NOWPayments IPN Verifier DRY, 131 LOC Non-Test Ceiling, & 4 Test Monoliths)

**Date:** 2026-10-17
**Brainstorm Report:** `plans/reports/20261017-wave2-deep-refactor-ipn-dry-and-132-loc-ceiling-brainstorm-report.md`
**Status:** In Progress

## Brainstorm Contract Summary
- **Outcome:**
  1. Unify NOWPayments IPN webhook verification across `/api/ee/billing/nowpayments-ipn` and `/api/ee/billing/ipn` via `src/ee/billing/nowpayments-ipn-verifier.ts`, and wire `GET /api/ee/quotas` to `resolveWorkspaceTierContext` so IPN-upgraded workspaces receive their upgraded tier entitlements.
  2. Modularize the 5 largest remaining non-test files (`design-system-style-guide.tsx`, `bot-manager-test-utils.ts`, `backtests-test-helpers.tsx`, `survival-gate-monitor.tsx`, `dashboard-client.tsx`) so **0 non-test files in `src/` exceed `131 LOC`**.
  3. Slice the 4 remaining ~400 LOC test monoliths (`scheduler.test.ts`, `bot-order-executor.test.ts`, `evaluator.test.ts`, `compiler.test.ts`) below `240 LOC` each.
- **Constraints:** `PAPER/BACKTEST ONLY`, preserve all public exports and HTTP status codes (`200`/`400`/`401`/`403`/`500`), `0 :any`, `0 console.log`, `0 eslint-disable`.

## Phases

| Phase | Title | Target Files | Status |
|---|---|---|---|
| **Phase 01** | [SaaS Billing IPN Verifier DRY & Quotas Context Unification](./phase-01-billing-ipn-dry-and-quotas-context.md) | `nowpayments-ipn-verifier.ts`, `nowpayments-ipn/route.ts`, `ipn/route.ts`, `quotas/route.ts` | Pending |
| **Phase 02** | [Non-Test Hotspot Modularization (<= 131 LOC Ceiling)](./phase-02-non-test-hotspot-modularization.md) | `design-system-style-guide*.ts(x)`, `survival-gate-monitor*.ts(x)`, `dashboard-client.tsx`, `bot-manager-test-*.ts`, `backtests-test-*.ts(x)` | Pending |
| **Phase 03** | [Test Monolith Slicing (< 240 LOC) & Verification](./phase-03-test-monolith-slicing-and-verification.md) | `scheduler*.test.ts`, `bot-order-executor*.test.ts`, `evaluator*.test.ts`, `compiler*.test.ts` | Pending |
