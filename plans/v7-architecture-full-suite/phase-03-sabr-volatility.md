## Plan Context links
- [Main Plan](./plan.md)

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Implement the SABR (Stochastic Alpha, Beta, Rho) volatility model for pricing and identifying mispriced options on the volatility surface.

## Key Insights
- SABR is the industry standard for modeling the volatility smile.
- Implied volatility calculations require robust root-finding algorithms (e.g., Newton-Raphson or Brent).

## Requirements
- SABR Hagen 2002 asymptotic formula implementation.
- Options pricing engine utilizing the SABR parameters.
- No `:any`, file sizes < 200 LOC.

## Architecture
- `src/quant/sabr-engine.ts`: Core mathematics for SABR volatility surface.
- `src/quant/black-76.ts`: Base Black-76 pricer used in conjunction with SABR.
- `src/arbitrage/vol-surface-arb.ts`: Scan across strikes/maturities looking for theoretical vs market discrepancies.

## Related Code Files
- **Create:** `src/quant/sabr-engine.ts`
- **Create:** `src/quant/black-76.ts`
- **Create:** `src/arbitrage/vol-surface-arb.ts`
- **Create:** `tests/quant/sabr-engine.test.ts`

## Implementation Steps
1. Implement Black-76 for forward options.
2. Implement SABR model to calculate implied normal/lognormal volatility given $\alpha, \beta, \rho, \nu$.
3. Create the arbitrage scanner to identify $Market_{IV} - SABR_{IV} > \text{Threshold}$.
4. Extensive mathematical unit tests.

## Todo List
- [ ] Black-76 pricer
- [ ] SABR volatility calculator
- [ ] Surface arb scanner
- [ ] Math validation tests

## Success Criteria
- SABR implementation accurately models both ITM/OTM smiles without negative roots.
- Tests pass against known quantitative benchmarks for SABR.

## Risk Assessment
- **Risk:** At-the-money (ATM) singularity in SABR formula.
- **Mitigation:** Implement the specific ATM expansion formula to handle $K \approx F$.

## Next Steps
- Execute Phase 3 implementation.