---
phase: 2
title: "Phase 2: Modular Package Extraction and CLI Experience (Steps 6–10)"
status: todo
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Modular Package Extraction and CLI Experience (Steps 6–10)

## Overview
Turn the pure Apache-2.0 domain (`src/tree/quantlib`, `src/tree/research/alpha/zoo`, and paper backtesting) into clean, consumable public entrypoints with a 60-second zero-config local CLI runner that naturally funnels open-source users to the hosted Cloud SaaS.

## Requirements
- **Functional:**
  - Step 6: Create unified public SDK barrel `src/tree/quantlib/public-sdk.ts` exporting core volatility, liquidity, microstructure, and strategy estimators with strict TypeScript types.
  - Step 7: Create public Alpha Zoo & IC/IR falsification SDK barrel `src/tree/research/alpha/zoo/public-sdk.ts` for standalone factor evaluation.
  - Step 8: Create `src/lib/edition/edition-mode.ts` detecting runtime edition (`OSS_LOCAL` vs `CLOUD_SAAS`) with safe defaults so self-hosted users can run single-user mode without Stripe/NOWPayments keys.
  - Step 9: Create deterministic CLI summary formatter `src/tree/cli/paper-cli-report.ts` that outputs paper backtest & falsification metrics plus a non-intrusive "Sync to CashClaw 24/7 Cloud" call-to-action footer.
  - Step 10: Provide a deterministic 3-asset mini OHLCV + microstructure quickstart fixture `src/tree/cli/quickstart-fixture.ts` for instant 60-second verification.
- **Non-functional:**
  - All modules pure TypeScript, zero `:any`, < 200 LOC per file, 100% unit test coverage on new modules.

## Architecture
```
src/tree/
├── quantlib/public-sdk.ts            # Step 6: Clean OSS QuantLib public entry
├── research/alpha/zoo/public-sdk.ts  # Step 7: Clean OSS Alpha Zoo public entry
└── cli/
    ├── quickstart-fixture.ts         # Step 10: Deterministic 60s demo fixture
    └── paper-cli-report.ts           # Step 9: ASCII report + Cloud SaaS upsell link
src/lib/edition/
└── edition-mode.ts                   # Step 8: OSS_LOCAL vs CLOUD_SAAS runtime detector
```

## Related Code Files
- Create: `src/tree/quantlib/public-sdk.ts`
- Create: `src/tree/research/alpha/zoo/public-sdk.ts`
- Create: `src/lib/edition/edition-mode.ts`
- Create: `src/tree/cli/quickstart-fixture.ts`
- Create: `src/tree/cli/paper-cli-report.ts`
- Create: `src/tree/cli/__tests__/paper-cli-report.test.ts`

## Implementation Steps
1. **Step 6 (`quantlib/public-sdk.ts`):** Re-export the flagship QuantLib modules (volatility-dca, Corwin-Schultz, Abdi-Ranaldo, Lesmond LOT, Pastor-Stambaugh, Garman-Klass, Parkinson, Yang-Zhang) with version metadata.
2. **Step 7 (`zoo/public-sdk.ts`):** Re-export `AlphaZooAdapter`, operator parser/evaluator, and IC analysis contracts.
3. **Step 8 (`edition-mode.ts`):** Implement pure environment-driven edition resolver (`resolveEditionConfig`) distinguishing `OSS_LOCAL` (single-user, BYOK, local SQLite/D1) from `CLOUD_SAAS` (multi-tenant, managed quotas, billing active).
4. **Step 9 (`paper-cli-report.ts`):** Build pure markdown/ASCII report builder for CLI backtest runs including Sharpe, Max Drawdown, Win Rate, and Cloud Sync URL.
5. **Step 10 (`quickstart-fixture.ts`):** Provide deterministic 60-second OHLCV seed bars with fees/slippage pre-configured for instant OSS onboarding.

## Todo
- [x] Step 6: Create `src/tree/quantlib/public-sdk.ts`
- [x] Step 7: Create `src/tree/research/alpha/zoo/public-sdk.ts`
- [x] Step 8: Create `src/lib/edition/edition-mode.ts`
- [x] Step 9: Create `src/tree/cli/paper-cli-report.ts`
- [x] Step 10: Create `src/tree/cli/quickstart-fixture.ts` and unit tests

## Success Criteria
- [x] External consumers can import `@/tree/quantlib/public-sdk` and `@/tree/research/alpha/zoo/public-sdk` with zero side effects.
- [x] `edition-mode.ts` defaults to `OSS_LOCAL` when SaaS secrets are absent, ensuring `git clone && npm test` works out-of-the-box.

## Risk Assessment
- **Risk:** Missing Cloud env vars break local OSS developers.
- **Mitigation:** `resolveEditionConfig` gracefully falls back to `OSS_LOCAL` with single-user limits whenever `CASHCLAW_EDITION !== 'CLOUD_SAAS'`.
