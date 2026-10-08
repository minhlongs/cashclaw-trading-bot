# Phase 3: RFQ Dark Mesh & Fair-Share Liquidity Aggregator

## Context Links
- Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/unified-v10-architecture-spec.md`
- Brainstorming Report: `docs/brainstorming-unified-v10-architecture.md`

## Overview
- **Priority**: High
- **Status**: pending
- **Effort**: 1.5h
- **Target Files**:
  - `src/tree/execution/darkmesh/rfq-darkmesh-types.ts`
  - `src/tree/execution/darkmesh/rfq-darkmesh-router.ts`
  - `src/tree/execution/darkmesh/rfq-darkmesh-router.test.ts`

## Key Insights & Architectural Mechanics
Extends internal peer-to-peer liquidity crossing into a multi-party Request-For-Quote (RFQ) Dark Mesh:
1. **RFQ Ingestion**: Participants submit signed RFQs with `[symbol, side, quantity, maxSlippageBps, urgency]`.
2. **Pro-Rata Fair-Share Matching**: When total aggregate demand on the heavy side exceeds aggregate opposing liquidity, fill quantities are distributed pro-rata by requested quantity:
   $$Q_k^{\text{fill}} = Q^{\text{opposing\_total}} \times \frac{Q_k^{\text{requested}}}{\sum_m Q_m^{\text{requested}}}$$
3. **Volume Conservation**: Exact conservation of total executed volume across buy and sell legs.
4. **Zero Taker Fee**: Settle internally without incurring venue taker fees.

## Requirements
- Support multiple buy and sell RFQs across diverse bots and strategies.
- Compute matched fills, unfulfilled residual quantities, fee savings, and slippage verification against reference mid-price.
- Max lines per file $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage checking pro-rata fairness, volume conservation, empty sides, and slippage violations.

## Implementation Steps
1. Create `rfq-darkmesh-types.ts` with RFQ request and match structures.
2. Implement `RfqDarkMeshRouter` in `rfq-darkmesh-router.ts`.
3. Add unit tests in `rfq-darkmesh-router.test.ts`.
4. Export through `src/tree/execution/darkmesh/index.ts`.
