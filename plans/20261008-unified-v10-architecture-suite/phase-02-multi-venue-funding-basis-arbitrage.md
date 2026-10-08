# Phase 2: Multi-Venue Perpetual Funding Rate Basis Arbitrage

## Context Links
- Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/unified-v10-architecture-spec.md`
- Brainstorming Report: `docs/brainstorming-unified-v10-architecture.md`

## Overview
- **Priority**: High
- **Status**: pending
- **Effort**: 1.5h
- **Target Files**:
  - `src/tree/quantlib/arbitrage/funding-basis-types.ts`
  - `src/tree/quantlib/arbitrage/funding-basis-engine.ts`
  - `src/tree/quantlib/arbitrage/funding-basis-engine.test.ts`

## Key Insights & Mathematical Model
Extract market-neutral yield by going long on venue $j$ (low/negative funding) and short on venue $i$ (high positive funding):
$$\text{GrossAnnualYield} = (\text{FundingRate}_i - \text{FundingRate}_j) \times \left(\frac{24}{H}\right) \times 365$$

Net annual yield accounting for taker fee roundtrips, borrow rate, and holding duration:
$$\text{NetYield} = \text{GrossAnnualYield} - \frac{2 \times (\text{TakerFee}_i + \text{TakerFee}_j)}{\text{HoldingDays} / 365} - \text{BorrowCost}$$

Liquidation distance safety buffer:
$$D_{\text{liq}} = \min\left(\frac{P_{\text{entry}, i} - P_{\text{liq}, i}}{P_{\text{entry}, i}}, \frac{P_{\text{liq}, j} - P_{\text{entry}, j}}{P_{\text{entry}, j}}\right)$$

## Requirements
- Multi-venue rate comparison supporting varying funding intervals (e.g., 8-hour on Binance/OKX vs 1-hour on dYdX/Deribit).
- Liquidation buffer calculation preventing margin breach under high leverage.
- Recommendation state: `EXECUTE`, `HOLD`, `UNWIND`, or `REJECT` based on minimum net APR hurdle threshold.
- Max lines per file $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage with edge cases (zero spread, negative rates, fee eating yield, liquidation proximity).

## Implementation Steps
1. Create `funding-basis-types.ts` defining venue quotes, arbitrage pairs, and execution parameters.
2. Implement `FundingBasisEngine` in `funding-basis-engine.ts`.
3. Add unit tests in `funding-basis-engine.test.ts` validating all scenarios.
4. Export through `src/tree/quantlib/index.ts`.
