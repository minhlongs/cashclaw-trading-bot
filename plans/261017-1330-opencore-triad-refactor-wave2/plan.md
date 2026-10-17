---
title: "Open-Core Triad Refactor Wave 2 (Monolith Slicing, NOWPayments IPN & QuantLib Expansion)"
status: completed
priority: P1
created: 2026-10-17
---

# Plan: Open-Core Triad Refactor Wave 2 (Monolith Slicing, NOWPayments IPN & QuantLib Expansion)

## Overview
- Priority: High (Core Architecture & SaaS Monetization)
- Status: Completed
- Scope:
  1. **Phase 1: Test Monolith Elimination Wave 2**
     - Slicing `e2e-research-agent.test.ts` (1,501 LOC) into 4 Tier suites under `research-agent/__tests__/e2e/`.
     - Slicing `backtests-client.test.tsx` (551 LOC) into sub-suites under `backtests/__tests__/`.
     - Slicing `bot-instance.test.ts` (547 LOC) into sub-suites under `src/tree/bot/__tests__/`.
     - Slicing `binance-ws-connection.test.ts` (509 LOC) into sub-suites under `src/tree/exchange/ws/__tests__/`.
  2. **Phase 2: Cloud SaaS NOWPayments IPN Webhook & Tier Activation**
     - Endpoint: `src/app/api/ee/billing/nowpayments-ipn/route.ts`
     - WebCrypto HMAC-SHA512 signature validation (`x-nowpayments-sig`).
     - Anti-replay timestamp window & idempotent database status updates.
     - Upgrades user tier: `BASIC | PREMIUM | ENTERPRISE | MASTER` (strictly uppercase).
     - Full test coverage with mocks in `src/app/api/ee/billing/nowpayments-ipn/route.test.ts`.
  3. **Phase 3: Quantitative Library & CLI Expansion**
     - Add `AmihudIlliquidityEngine` (Amihud 2002 absolute return to dollar volume ratio) to `src/tree/quantlib/liquidity/`.
     - Add `RollEffectiveSpreadEngine` (Roll 1984 autocovariance spread estimator) to `src/tree/quantlib/microstructure/`.
     - Maintain strict 100% statement/branch/function/line coverage in `src/tree/quantlib/**`.
     - Export via `src/tree/quantlib/public-sdk.ts`.
     - Integrate diagnostics into `bin/cashclaw.js eval` command.
  4. **Phase 4: Verification & Final Quality Gate**
     - `npx tsc --noEmit` clean.
     - `npm run lint` clean (0 warnings, 0 errors).
     - `npm test` 100% green across all test files.
     - Git commit with attribution.
