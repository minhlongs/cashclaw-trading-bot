## Plan Context links
- [Main Plan](./plan.md)

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Implement a cross-domain execution engine capturing basis spreads between Centralized Exchanges (CEX) and Decentralized Exchanges (DEX).

## Key Insights
- Latency mismatch between CEX (ms) and DEX (block time) requires strict slippage and execution safety guarantees.
- Gas costs must be factored dynamically into the DEX leg.

## Requirements
- Real-time basis spread calculator.
- Aggregated orderbook/pool view.
- Safety locking mechanisms to prevent partial fills.

## Architecture
- `src/arbitrage/basis-calculator.ts`: Net basis calculation including fees + gas.
- `src/execution/cross-domain-executor.ts`: Two-leg atomic-style execution simulator.
- `src/models/exchange-types.ts`: CEX/DEX normalized liquidity models.

## Related Code Files
- **Create:** `src/arbitrage/basis-calculator.ts`
- **Create:** `src/execution/cross-domain-executor.ts`
- **Create:** `src/models/exchange-types.ts`
- **Create:** `tests/arbitrage/basis-calculator.test.ts`

## Implementation Steps
1. Define `NormalizedOrderbook` and `AMMPool` state types.
2. Implement `BasisCalculator` to compute `(DEX_Bid - CEX_Ask) - (CEX_Fee + DEX_Fee + Gas)`.
3. Implement `CrossDomainExecutor` handling timing: execute CEX leg, submit DEX leg, handle rollback/hedge if DEX leg reverts.
4. Implement tests for fee/gas edge cases and slippage logic.

## Todo List
- [ ] Liquidity models
- [ ] Basis calculation with gas
- [ ] Execution mock simulator 
- [ ] Tests for profitability barriers

## Success Criteria
- Engine only signals EXECUTE when `Net Basis > Threshold`.
- Slippage checks accurately account for AMM constant product curves.

## Risk Assessment
- **Risk:** Leg risk (CEX fills, DEX reverts).
- **Mitigation:** Strict gas limit padding and slippage bound configurations.

## Next Steps
- Execute Phase 2 implementation.