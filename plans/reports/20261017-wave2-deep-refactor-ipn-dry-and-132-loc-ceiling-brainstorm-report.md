# Deep Brainstorm Report: Wave 2 Quad-Cluster Refactor (NOWPayments IPN Verifier DRY, Quotas Context, 132 LOC Non-Test Ceiling & 4 Test Monoliths)

**Date:** 2026-10-17
**Mode:** `/ak-brainstorm --deep`
**Scope:** `src/ee/billing/**`, `src/app/api/ee/**`, `src/components/{quant,dashboard}/**`, and 4 test monoliths (`398–410 LOC`)

---

## 1. Brainstorm Contract

- **Outcome:**
  1. **SaaS Billing IPN Verifier DRY & Quotas Unification:** Eliminate duplicated NOWPayments HMAC-SHA512 request verification across `POST /api/ee/billing/nowpayments-ipn` (`120 LOC`) and `POST /api/ee/billing/ipn` (`62 LOC`) via a shared `verifyNowPaymentsIpnRequest` helper in `src/ee/billing/nowpayments-ipn.ts` (closing the `.trim().toLowerCase()` signature normalization and 300s timestamp anti-replay gap in `ipn/route.ts`), and wire `GET /api/ee/quotas` to `resolveWorkspaceTierContext` so IPN-upgraded workspace tiers reflect immediately on quota queries.
  2. **Zero Non-Test Files > 132 LOC across `src/`:** Modularize all 4 remaining non-test files above `140 LOC` (`design-system-style-guide.tsx` 159 LOC, `bot-manager-test-utils.ts` 159 LOC, `backtests-test-helpers.tsx` 153 LOC, `survival-gate-monitor.tsx` 146 LOC) plus extract pure KPI mapping from `dashboard-client.tsx` (`132 LOC`) into `dashboard-data-mapper.ts`, lowering the repo-wide non-test ceiling from `159 LOC` to `131 LOC`.
  3. **Zero Test Monoliths >= 370 LOC:** Slice the 4 remaining ~400 LOC test monoliths (`scheduler.test.ts` 410 LOC, `bot-order-executor.test.ts` 401 LOC, `evaluator.test.ts` 400 LOC, `compiler.test.ts` 398 LOC) into focused domain suites strictly `< 240 LOC` each.
- **Constraints:**
  - `PAPER/BACKTEST ONLY` — zero live trading changes; NOWPayments IPN protected flow must remain 100% backward-compatible.
  - Zero `:any` types, zero `console.log`, zero new `eslint-disable` comments.
  - Preserve all existing public exports and re-exports on test helper barrels (`bot-manager-test-utils.ts`, `backtests-test-helpers.tsx`).
- **Non-Goals:**
  - No database schema migrations or changes to core strategy/backtest math.
  - No changes to Polar (strictly prohibited by handover rules).
- **Acceptance Criteria:**
  1. Every non-test file (`*.ts`, `*.tsx` excluding `*.test.*`) in `src/` is strictly `<= 132 LOC`.
  2. Both `/api/ee/billing/nowpayments-ipn` and `/api/ee/billing/ipn` share `verifyNowPaymentsIpnRequest`, and `GET /api/ee/quotas` honors `x-cashclaw-workspace` / `?workspaceId=` stored tiers via `resolveWorkspaceTierContext`.
  3. All 4 targeted test monoliths (`scheduler.test.ts`, `bot-order-executor.test.ts`, `evaluator.test.ts`, `compiler.test.ts`) are split below `240 LOC` each.
  4. `npx tsc --noEmit`, `npx eslint src/`, `npm test`, and `npm run audit:oss` exit 0.

---

## 2. Empirical Evidence & Root-Cause Findings

### A. NOWPayments IPN Duplication & Quota Context Seam
| File | LOC | Architectural Finding |
|---|---|---|
| `src/app/api/ee/billing/nowpayments-ipn/route.ts` | 120 | Performs raw body read, `x-nowpayments-timestamp` 300s replay check, `JSON.parse`, `canonicalizeNowPaymentsJson`, `computeNowPaymentsHmacSha512` (`.trim().toLowerCase()`), and `NowPaymentsIpnPayloadSchema.safeParse` inline before persisting to `defaultSaasEntitlementStore`. |
| `src/app/api/ee/billing/ipn/route.ts` | 62 | Duplicates raw body read, `JSON.parse`, `canonicalizeNowPaymentsJson`, `computeNowPaymentsHmacSha512`, and `NowPaymentsIpnPayloadSchema.safeParse`, **but** omits `.trim().toLowerCase()` on `sigHeader` and omits the 300s timestamp replay guard. |
| `src/app/api/ee/quotas/route.ts` | 36 | Reads `url.searchParams.get('tier')` with `SaasTierSchema.default('BASIC')` directly instead of `resolveWorkspaceTierContext`. A workspace upgraded to `ENTERPRISE` via NOWPayments IPN still receives `BASIC` quotas if it passes `x-cashclaw-workspace: ws_1` without `?tier=ENTERPRISE`. |

### B. Remaining Non-Test Hotspots (`132–159 LOC`)
| File | LOC | Decomposition Target (`<= 115 LOC` each) |
|---|---|---|
| `src/components/quant/design-system-style-guide.tsx` | 159 | Extract `TokenGroup`, `ColorSwatch`, `COLOR_SWATCHES`, and typography/primitive metadata into `design-system-style-guide-model.ts`. |
| `src/tree/bot/__tests__/bot-manager-test-utils.ts` | 159 | Extract `mockRequest` + `makeBotRow` into `bot-manager-test-fixtures.ts` and re-export from `bot-manager-test-utils.ts`. |
| `src/app/[locale]/backtests/__tests__/backtests-test-helpers.tsx` | 153 | Extract bilingual `MESSAGES` dictionary into `backtests-test-messages.ts` and re-export from `backtests-test-helpers.tsx`. |
| `src/components/quant/survival-gate-monitor.tsx` | 146 | Extract `GatePillar`, `SurvivalCheckItem`, `SURVIVAL_CHECKS`, and `computeSurvivalSummary` into `survival-gate-monitor-model.ts`. |
| `src/components/dashboard/dashboard-client.tsx` | 132 | Extract pure `mapBotsPayloadToDashboardData` into `dashboard-data-mapper.ts` with dedicated unit tests. |

### C. Top 4 Test Monoliths (`398–410 LOC`)
| File | LOC | Clean Split Boundary (`< 240 LOC` each) |
|---|---|---|
| `src/forest/bot/scheduler.test.ts` | 410 | Core tick/circuit-breaker (`scheduler.test.ts`) + cold-start hydration, D1 failure, & rate-limit tracking (`scheduler-resilience.test.ts`). |
| `src/tree/bot/bot-order-executor.test.ts` | 401 | Direct execution, PnL/killswitch, & telemetry (`bot-order-executor.test.ts`) + ExchangeOrchestrator routing & fallback (`bot-order-executor-orchestrator.test.ts`). |
| `src/tree/alpha/hypothesis/evaluator.test.ts` | 400 | Core hypothesis evaluation, barriers, & numericValue (`evaluator.test.ts`) + indicator direction rules (`evaluator-direction-rules.test.ts`). |
| `src/tree/research/alpha/compiler.test.ts` | 398 | Stages 1–5 validation & determinism (`compiler.test.ts`) + ExperimentSpec structure & edge cases (`compiler-spec.test.ts`). |

---

## 3. 5-Turn Socratic Cross-Examination (`--deep`)

1. **Q1 (Threat Model — IPN Signature & Replay):** *Does extracting `verifyNowPaymentsIpnRequest` change HTTP status codes for existing IPN tests?*
   - **A1:** No. Returning a typed union `{ ok: true, payload } | { ok: false, status: 400 | 401, error: string }` preserves 401 for missing/invalid signatures or expired timestamps and 400 for invalid JSON or Zod schema failures.
2. **Q2 (Quota Consistency):** *What if a caller passes an invalid `?tier=INVALID` to `GET /api/ee/quotas`?*
   - **A2:** Validate explicit `?tier=` with `SaasTierSchema.safeParse` first so invalid explicit query params still return `400 INVALID_TIER_QUERY`, then delegate tier resolution (explicit tier -> stored IPN tier -> header tier -> `'BASIC'`) to `resolveWorkspaceTierContext`.
3. **Q3 (Test Helper Compatibility):** *Will splitting `bot-manager-test-utils.ts` and `backtests-test-helpers.tsx` break existing test imports?*
   - **A3:** Zero breakage because both files re-export all extracted symbols (`export * from './bot-manager-test-fixtures'`).
4. **Q4 (YAGNI Check on UI Models):** *Are `design-system-style-guide-model.ts` and `survival-gate-monitor-model.ts` pure data/logic or over-abstraction?*
   - **A4:** Pure static token catalogs + filter/summary helpers with zero React hooks, directly testable in Node without JSDOM.
5. **Q5 (Blast Radius):** *Does any change touch live order execution or CCXT?*
   - **A5:** Zero changes to live exchange adapters or order placement logic; `PAPER/BACKTEST ONLY` invariant remains untouched.

---

## 4. Viable Approaches

| Option | Scope | Pros | Cons |
|---|---|---|---|
| **Option A (Recommended): Full Quad-Cluster Wave 2** | Cluster A (IPN DRY + Quotas context) + Cluster B (5 non-test files <= 131 LOC) + Cluster C (4 test monoliths < 240 LOC) | Fixes IPN verifier divergence & quota tier lookup, lowers repo non-test ceiling to `131 LOC`, and eliminates all `~400 LOC` test monoliths | Touches ~22 files across 3 phases |
| **Option B: Billing DRY + Non-Test Hotspots Only** | Cluster A + Cluster B (skip test monolith slicing) | Smaller diff (~13 files) | Leaves 4 test monoliths at `398–410 LOC` |
| **Option C: Non-Test Hotspots Only** | Cluster B only | Minimal diff | Leaves IPN route duplication and `/api/ee/quotas` workspace tier gap open |
