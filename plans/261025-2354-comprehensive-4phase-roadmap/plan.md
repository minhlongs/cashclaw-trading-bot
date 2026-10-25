---
title: "Comprehensive 4-Phase Roadmap: QuantLib Execution Types Consolidation, Git Hygiene, SaaS Billing Hydration & Bot Execution Integration"
description: "Sequential 4-phase technical roadmap consolidating 36 single-importer types in quantlib/execution, enforcing repository and git hygiene, hydrating SaaS billing UI from real D1 entitlement APIs, and integrating Almgren-Chriss/VPIN execution sizing into paper bot trading."
status: completed
priority: P1
effort: 4h
issue: 25
branch: feat/comprehensive-4phase-roadmap
tags: [refactor, quantlib, git, saas, billing, bot, execution]
blockedBy: []
blocks: []
created: 2026-10-25
---

# Plan — Comprehensive 4-Phase Roadmap

## Overview & Background
Following the verified architecture advice in `plans/reports/advise-261025-2352-comprehensive-roadmap.md` (`ak:advise --ultra`), this plan executes the 4 confirmed sequential phases for `minhlongs/cashclaw-trading-bot`:
1. **P1 — Execution Types Consolidation**: Merge 36 single-importer `*-types.ts` in `src/tree/quantlib/execution/` into their consumer `*-engine.ts` siblings, keep 1 blocked stem (`cartea-jaimungal-types.ts`), update 4 test files in `test/quant/`, reducing production files from 75 to 39 while ensuring max LOC <= 120.
2. **P2 — Git Hygiene & Worktree Cleanup**: Remove obsolete local branches (`feat/alpha-research-os-phase7..10`), prune stale worktrees, and clean untracked report scratch files.
3. **P3 — SaaS Billing & IPN End-to-End Real Seam**: Hydrate `/billing` dashboard from real `GET /api/ee/quotas` and `GET /api/ee/credits`, align `/api/ee/billing/ipn/route.ts` with `/api/ee/billing/nowpayments-ipn/route.ts` to update `defaultSaasEntitlementStore`, and connect the checkout modal.
4. **P4 — QuantLib Bot Strategy Execution Integration**: Integrate `computeAlmgrenChrissTrajectory` and `evaluateVpinThrottling` into `src/tree/bot/strategies/volatility-dca-execution.ts` with backward compatibility and strict adherence to ADR-001 paper-only trading.

## Phases Summary
- [Phase 1: QuantLib Execution Types Consolidation](phase-01-execution-types-consolidation.md)
- [Phase 2: Git Hygiene, Worktrees & Scratch Cleanup](phase-02-git-hygiene-and-scratch-cleanup.md)
- [Phase 3: SaaS Billing Hydration & IPN Seam Synchronization](phase-03-saas-billing-hydration-and-ipn-seam.md)
- [Phase 4: QuantLib Bot Execution & Toxicity Guard Integration](phase-04-quantlib-bot-execution-integration.md)

## Acceptance Criteria
- [x] `find src/tree/quantlib/execution -maxdepth 1 -name "*.ts" ! -name "*.test.ts" | wc -l` equals 39.
- [x] No production file in `src/tree/quantlib/execution/` exceeds 120 LOC (max <= 88 LOC).
- [x] `cartea-jaimungal-types.ts` is preserved as the only remaining types file in `src/tree/quantlib/execution/`.
- [x] Git worktrees list only the primary workspace and active feature worktree; 4 stale branches removed.
- [x] `/billing` page renders hydrated quota/credits state from `/api/ee/quotas` and `/api/ee/credits`.
- [x] `/api/ee/billing/ipn/route.ts` calls `defaultSaasEntitlementStore.recordIpnAndUpgradeTier` with idempotency.
- [x] Bot execution loop calculates Almgren-Chriss trajectory / VPIN throttling in paper mode (ADR-001 compliant).
- [x] `npm run quality:gate` (`type-check`, `lint`, `vitest run --coverage`, `knip`) passes 100% with exit code 0.

## Non-Goals & Invariants
- STRICT PAPER-ONLY INVARIANT: Zero live orders or real capital connections to CEX (ADR-001).
- No modifications to `@cashclaw/quantlib` public SDK exports (`src/tree/quantlib/public-sdk.ts`).
- No modifications to the default `subDir` parameter of `scripts/count-type-importers.mjs` to preserve `test/scripts/count-type-importers.test.ts`.

## Red Team Review
- **Assumption Destroyer**: Verified `test/scripts/count-type-importers.test.ts:268` calls `countImporters()` with no args; Phase 1 preserves default `subDir = 'src/tree/quantlib/microstructure'`.
- **Failure Mode Analyst**: Verified `VolatilityDcaStrategy` order tests (`src/tree/bot/strategies/volatility-dca-orders.test.ts:56`) assert exact `quantity: 1000 / 48500` on default `executeDcaOrder`; Phase 4 exposes opt-in `quantExecution` / `executeQuantDcaOrder` so existing callers remain 100% unchanged.
- **Security Adversary**: Verified `NOWPAYMENTS_IPN_SECRET` stays strictly server-side inside `/api/ee/billing/ipn/route.ts` and `/api/ee/billing/nowpayments-ipn/route.ts`.

### Whole-Plan Consistency Sweep
- All 4 phase files have strictly disjoint file ownership (`Phase 1`: `scripts/` + `src/tree/quantlib/execution/` + `test/quant/`; `Phase 2`: git refs/worktrees; `Phase 3`: `src/app/api/ee/billing/ipn/`, `src/components/billing/`, `src/app/[locale]/(dashboard)/billing/`; `Phase 4`: `src/tree/bot/strategies/`).
- Zero unresolved contradictions.

## Validation Log
### Verification Results
- Claims checked: 40
- Verified: 40 | Failed: 0 | Unverified: 0
- Tier: Standard
- Failures: None

### Whole-Plan Consistency Sweep
- Verified all file paths, line counts, and acceptance criteria across `plan.md` and `phase-01..04.md`.

