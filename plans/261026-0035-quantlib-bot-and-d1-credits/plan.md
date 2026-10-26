---
title: "Next Wave: Single-Importer Types Consolidation, D1 Credit Persistence & Volatility-DCA Quant Sizing Opt-in"
description: "Consolidate remaining 5 single-importer types in quantlib (marketmaking/portfolio/volatility), wire optional quantExecution opt-in into Volatility DCA Bot config/handler, and ensure D1 credit persistence resilience."
status: completed
priority: P1
effort: 2h
branch: feat/next-wave-quantlib-bot-and-d1-credits
tags: [quantlib, types, bot, d1, credits, execution]
blockedBy: []
blocks: []
created: 2026-10-26
---

# Plan — Next Wave: QuantLib Types Consolidation, D1 Credits & Bot Sizing Opt-in

## Context & Objectives
Following the successful completion and merge of PR #26 (closing Issue #25), the repository audit revealed 3 concrete high-leverage backlog items:
1. **Phase 1 (QuantLib Types Consolidation in marketmaking, portfolio, volatility)**:
   - `src/tree/quantlib/marketmaking/avellaneda-stoikov-types.ts` (merge into `avellaneda-stoikov-engine.ts`, update `test/quant/avellaneda-stoikov-engine.test.ts`)
   - `src/tree/quantlib/portfolio/black-litterman-types.ts` (merge into `black-litterman-engine.ts`, update `test/quant/bayesian-black-litterman.test.ts` & `test/quant/v12-full-suite-simulation.test.ts`)
   - `src/tree/quantlib/volatility/bipower-variation-types.ts` (merge into `bipower-variation-engine.ts`)
   - `src/tree/quantlib/volatility/parkinson-volatility-types.ts` (merge into `parkinson-volatility-engine.ts`, update `test/quant/parkinson-volatility.test.ts`)
   - `src/tree/quantlib/volatility/gatheral-rough-volatility-types.ts` (merge into `gatheral-rough-volatility.ts`)
   - Keep all modified files <= 100 LOC.
2. **Phase 2 (Volatility DCA Bot Config & Handler QuantLib Sizing Opt-in)**:
   - Add optional `quantExecution?: boolean;` and optional `quantConfig?: { riskAversion?: number; halfLife?: number; }` to `VolatilityDcaBotConfig` in `src/tree/bot/config-types.ts`.
   - Update `handleVolatilityDcaTicker` in `src/tree/bot/strategies/volatility-dca-handler.ts` so when `s.config.quantExecution` is true, it calls `executeQuantDcaOrder` instead of `executeDcaOrder`, logging execution metrics (`urgencyKappa`, `strategyClass`, `firstSliceRatio`).
   - Keep `volatility-dca-handler.ts` <= 45 LOC.
3. **Phase 3 (D1 Entitlements & LLM Credit Ledger Verification)**:
   - Add unit test coverage in `src/ee/__tests__/` verifying D1 monthly credit initialization and ledger resilience.

## Acceptance Criteria
- [x] 5 types files deleted; consumers contain exported interfaces without exceeding 100 LOC.
- [x] `VolatilityDcaBotConfig` supports optional `quantExecution?: boolean`.
- [x] `handleVolatilityDcaTicker` routes through `executeQuantDcaOrder` when `quantExecution === true` and remains 100% backward compatible when undefined/false.
- [x] Full quality gate (`type-check`, `lint`, `vitest run`, `knip`) passes 100% with exit code 0.
- [x] Strict ADR-001 Paper-Only Invariant maintained.
