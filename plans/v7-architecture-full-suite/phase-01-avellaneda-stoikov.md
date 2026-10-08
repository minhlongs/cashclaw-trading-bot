## Plan Context links
- [Main Plan](./plan.md)

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Implement Avellaneda-Stoikov inventory-based market making to dynamically adjust bid/ask spreads based on inventory risk, integrating with the v6 Hawkes toxicity flow model. 

## Key Insights
- Requires high-performance math for continuous time approximations.
- Integration with v6 Hawkes is critical to widening spreads when toxicity spikes.

## Requirements
- `AvellanedaStoikovEngine` class for spread calculation.
- Reservation price and optimal spread formulas.
- Zero `:any` types.

## Architecture
- `src/quant/avellaneda-stoikov.ts`: Core math engine.
- `src/models/inventory-risk.ts`: Interfaces for inventory boundaries.
- `src/integration/v6-hawkes-connector.ts`: Hooks Hawkes scores into spread multiplier.

## Related Code Files
- **Create:** `src/quant/avellaneda-stoikov.ts`
- **Create:** `src/models/inventory-risk.ts` 
- **Create:** `src/integration/v6-hawkes-connector.ts`
- **Create:** `tests/quant/avellaneda-stoikov.test.ts`

## Implementation Steps
1. Define interfaces for `InventoryState` and `MarketParameters` in `src/models/inventory-risk.ts`.
2. Implement the `AvellanedaStoikovEngine` to calculate `reservationPrice` and `optimalSpread`.
3. Create `HawkesConnector` to scale the risk aversion parameter $\gamma$ based on incoming toxicity.
4. Write comprehensive unit tests for mathematical accuracy.

## Todo List
- [x] Interface definitions
- [x] Core AS equations
- [x] Hawkes toxicity integration
- [x] Unit tests

## Success Criteria
- Test cases validate AS spread formulas match known academic outputs within 1e-6 tolerance.
- Spreads demonstrably widen when Hawkes indicator is > 0.8.

## Risk Assessment
- **Risk:** Floating point precision issues with exponentials.
- **Mitigation:** Use `Decimal.js` or robust `number` bounding if performance allows.

## Next Steps
- Execute Phase 1 implementation.