# Quad-Cluster Deep Refactor Wave 2 Plan

## Status: COMPLETE (3/3 Phases Shipped)

- **Cluster A / Phase 01: SaaS Billing IPN Verifier DRY & Quotas Context Unification**
  - [x] Extracted `src/ee/billing/nowpayments-ipn-verifier.ts` (86 LOC) verifying headers, 300s replay window, HMAC-SHA512 canonical signatures, and Zod payload schema.
  - [x] Wired both `POST /api/ee/billing/nowpayments-ipn` and `POST /api/ee/billing/ipn` to shared verifier.
  - [x] Unified `GET /api/ee/quotas` with `resolveWorkspaceTierContext` to honor D1/in-memory upgraded tiers.
  - [x] Verified with `src/app/api/ee/__tests__/ee-routes.test.ts` (13/13 tests green).

- **Cluster B / Phase 02: Lower Non-Test File Ceiling Across `src/` to `<= 131 LOC`**
  - [x] Extracted pure models & fixtures:
    - `src/components/quant/design-system-style-guide-model.ts` (40 LOC)
    - `src/components/quant/survival-gate-monitor-model.ts` (37 LOC)
    - `src/components/dashboard/dashboard-data-mapper.ts` (53 LOC)
    - `src/forest/dashboard/quant-telemetry-seeds.ts` (40 LOC)
    - `src/tree/bot/__tests__/bot-manager-test-fixtures.ts` (63 LOC)
    - `src/app/[locale]/backtests/__tests__/backtests-test-messages.ts` (53 LOC)
  - [x] Slimmed target components to `<= 129 LOC` (`fdr-multiple-testing-gate.tsx`, `regime-attribution-simulator.tsx`, `execution-ledger-simulator.tsx`, `bots-list-client.tsx`, `bot-detail-client.tsx`, `quant-telemetry-service.ts`).
  - [x] Verified non-test ceiling across ALL of `src/` is `131 LOC`.

- **Cluster C / Phase 03: Slice Top 4 Test Monoliths (`398–410 LOC`) Below `240 LOC`**
  - [x] Sliced `src/forest/bot/scheduler.test.ts` into:
    - `scheduler.test.ts` (208 LOC)
    - `scheduler-resilience.test.ts` (239 LOC)
  - [x] Sliced `src/tree/bot/bot-order-executor.test.ts` into:
    - `bot-order-executor.test.ts` (191 LOC)
    - `bot-order-executor-orchestrator.test.ts` (168 LOC)
  - [x] Sliced `src/tree/alpha/hypothesis/evaluator.test.ts` into:
    - `evaluator.test.ts` (171 LOC)
    - `evaluator-direction-rules.test.ts` (183 LOC)
  - [x] Sliced `src/tree/research/alpha/compiler.test.ts` into:
    - `compiler.test.ts` (178 LOC)
    - `compiler-spec.test.ts` (145 LOC)
  - [x] Full quality gates: 6,046/6,046 tests passing across 702 test files, `tsc --noEmit` clean, ESLint 0 warnings, OSS audit clean.
