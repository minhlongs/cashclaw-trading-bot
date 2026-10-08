---
title: "Phase 3: Multi-Venue Unified Collateral & Synthetic Portfolio Margin Router"
description: "Cross-margin replication tracking synthetic liquidation distances with automated 75% utilization rebalancing"
status: completed
priority: P1
effort: 2h
branch: main
tags: [trading, quant, v8, margin, collateral, risk-management, rebalancing]
created: 2026-10-08
---

# Phase 3: Multi-Venue Unified Collateral & Synthetic Portfolio Margin Router

## Context Links
- Master Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/v8-architecture-deep-brainstorm.md`
- Margin Liquidation Guard Baseline: `src/tree/exchange/arbitrage/hedger/margin-liquidation-guard.ts:3`
- Evaluation Seam: `src/tree/exchange/arbitrage/hedger/margin-liquidation-guard.ts:7`
- Smart Execution Types: `src/tree/execution/smart/smart-execution-types.ts:1`

## Overview
- Priority: High (P1)
- Current Status: Pending
- Description: Implements a multi-venue synthetic portfolio margin router. Tracks collateral balances, maintenance margin requirements, asset haircuts, and liquidation distances across heterogeneous venues (CEX sub-accounts and on-chain perp vaults). Automatically calculates optimal collateral rebalancing transfers when any venue's margin utilization breaches 75%, preventing isolated liquidations and maximizing cross-venue capital efficiency.

## Key Insights
- In cross-venue basis trading and arbitrage, one leg can suffer drawdowns requiring additional margin even though the aggregated portfolio is net profitable.
- Isolated liquidation guards (`src/tree/exchange/arbitrage/hedger/margin-liquidation-guard.ts:7`) evaluate single dual-leg pairs; scaling to multi-venue requires a global unified synthetic margin model.
- Applying tiered asset haircuts (e.g. Stablecoin 1.0, BTC 0.90, ETH 0.85, Altcoins 0.60) ensures conservative collateral valuation under market stress.
- A greedy minimum-flow rebalancing solver determines the minimal transfer instructions between surplus venues (utilization < 50%) and strained venues (utilization >= 75%) while factoring in fixed transfer costs.

## Requirements
- Functional Requirements:
  - Aggregate collateral balances and open position notionals across N venues.
  - Apply customizable asset haircut discounts to compute effective collateral.
  - Calculate per-venue and portfolio-wide margin utilization ratios: U = MaintenanceMargin / EffectiveCollateral.
  - Compute synthetic liquidation distances and flag warnings when utilization >= 0.75 (CRITICAL at >= 0.85).
  - Generate optimal rebalancing transfer actions (`CollateralTransferAction`) minimizing transfer count and transaction fees.
- Non-Functional Requirements:
  - Strict TypeScript with zero `:any` types.
  - All source files <= 200 lines (target <= 130 LOC).
  - Pure deterministic math, zero direct external network calls (accepts balance snapshots), zero `console.log`.
  - 100% test coverage across statement, branch, function, and line metrics.

## Architecture
- Data Ingress: `VenueAccountSnapshot[]` containing venue ID, asset balances, open position notionals, and maintenance margin rates.
- Transformation Pipeline:
  1. `synthetic-margin-calculator.ts`: Applies asset haircuts, calculates effective collateral, maintenance margin, utilization percentage, and liquidation distance for each venue and the consolidated portfolio.
  2. `collateral-rebalance-router.ts`: Identifies venues with utilization >= 75% (deficits) and venues with utilization < 50% (surpluses). Solves optimal transfer amounts to rebalance utilization to safe target levels (e.g. 60%).
- Data Egress: `PortfolioMarginReport` containing per-venue health status, portfolio aggregate health, and list of recommended `CollateralTransferAction` objects.

## Related Code Files
- Create: `src/tree/margin/portfolio-margin-types.ts`
- Create: `src/tree/margin/synthetic-margin-calculator.ts`
- Create: `src/tree/margin/collateral-rebalance-router.ts`
- Create: `src/tree/margin/portfolio-margin.test.ts`
- Modify: None (completely isolated directory `src/tree/margin/`)
- Delete: None

## Implementation Steps
1. Define interfaces in `src/tree/margin/portfolio-margin-types.ts`:
   - `AssetBalance`, `PositionNotional`, `VenueAccountSnapshot`, `VenueMarginHealth`, `PortfolioMarginReport`, `CollateralTransferAction`, `MarginRouterConfig`.
2. Implement `src/tree/margin/synthetic-margin-calculator.ts`:
   - Haircut application: `calculateEffectiveCollateral(balances, haircuts)`.
   - Maintenance margin calculation: `calculateRequiredMaintenanceMargin(positions, marginRatios)`.
   - Health evaluation: `evaluateVenueMarginHealth(snapshot, config)`.
   - Portfolio aggregation: `calculatePortfolioMargin(venues, config)`.
3. Implement `src/tree/margin/collateral-rebalance-router.ts`:
   - Identify deficit venues (utilization >= rebalanceThresholdPct, default 0.75).
   - Identify surplus venues (utilization < safeTargetUtilizationPct, default 0.50).
   - Greedy allocation matching highest surplus to highest deficit.
   - Emit sorted `CollateralTransferAction` array with source, destination, amount, and projected post-transfer utilizations.
4. Create comprehensive test suite `src/tree/margin/portfolio-margin.test.ts`:
   - Test balanced multi-venue portfolio returning zero transfer actions.
   - Test asymmetric drawdown triggering rebalance transfer when venue crosses 75%.
   - Test haircut discounting on volatile collateral (e.g. BTC vs USDT).
   - Test edge cases: empty portfolio, zero equity, insolvent venue, insufficient global collateral.
   - Validate 100% test coverage.

## Todo List
- [ ] Create `portfolio-margin-types.ts` with strict interfaces
- [ ] Implement `synthetic-margin-calculator.ts` with haircut models
- [ ] Implement `collateral-rebalance-router.ts` with minimal transfer routing
- [ ] Write unit tests in `portfolio-margin.test.ts` covering all risk conditions
- [ ] Verify test suite passes with 100% coverage and 0 lint warnings

## Success Criteria
- Automated rebalancing trigger fires if and only if at least one venue breaches 75% utilization.
- Post-rebalance projection restores all venues below 65% utilization when aggregate capital permits.
- Transfer routing minimizes total transfer count (greedy pairing).
- All 4 files satisfy <= 200 LOC constraint (target <= 130 LOC).
- 100% test coverage achieved with vitest.

## Risk Assessment
- Risk: Insolvent global portfolio (aggregate utilization >= 100%) unable to rebalance.
  - Likelihood: Low | Impact: High
  - Mitigation: Flag `globalMarginDeficit: true`, emit emergency de-risking alert rather than attempting impossible transfers.
- Risk: Transfer fee exceeding rebalance benefit for tiny transfers.
  - Likelihood: Medium | Impact: Low
  - Mitigation: Enforce `minTransferThresholdUsd = 100` below which transfers are suppressed.

## Backwards Compatibility and Rollback Plan
- Backwards Compatibility: Additive engine in `src/tree/margin/`. Does not conflict with existing `margin-liquidation-guard.ts`.
- Rollback Plan: Delete `src/tree/margin/` directory; zero impact on existing bot operations or tests.

## Test Matrix
- Unit Tests:
  - `synthetic-margin-calculator`: Haircut discounting, utilization percentage, liquidation distance, consolidated portfolio summation.
  - `collateral-rebalance-router`: Single venue breach triggers transfer, multi-venue multi-deficit balancing, transfer threshold clamping, global deficit handling.
- Integration Test:
  - Multi-venue arbitrage portfolio simulated through a 30% price divergence shock, verifying timely rebalancing recommendations before liquidation.

## Security Considerations
- Read-only calculations on sanitized account snapshots; does not store or access API secrets or private keys.
- Output actions are informational recommendations consumed by paper execution or authorized transfer coordinators.

## Next Steps
- Execute Phase 3 implementation in parallel with Phase 1 and Phase 2.
