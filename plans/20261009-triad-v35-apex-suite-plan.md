# Plan: Triad v35 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion, git commit (`0ef398f`), and memory indexing of Triad v34 Apex Suite (5,687/5,687 green tests across 543 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 46$ LOC), the user selected "Cả 3 trụ cột (Recommended)" for **Triad v35 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Kratz-Schöneborn (2014) Optimal Liquidation with Dark Pools & Alternative Venues Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Peter Kratz & Torsten Schöneborn (2014) *"Portfolio Liquidation in the Presence of an Alternative Trading Venue"* (Mathematical Finance).
   - Models optimal liquidation across a lit order book (linear temporary impact $\eta$, permanent impact $\gamma$) and an uncrossing dark pool with Poisson arrival rate $\lambda_{\text{dark}}$ and execution probability $p_{\text{dark}}$.
   - Balances lit market impact against dark pool non-execution risk, computing trajectory, VWAP, dark capture fraction, and cost savings vs pure lit execution.
2. **Pillar 2: Biais-Hillion-Spatt (1995) Order Flow Dynamics & State-Dependent Liquidity Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Bruno Biais, Pierre Hillion, and Chester Spatt (1995) *"An Empirical Analysis of the Limit Order Book and the Order Flow in the Paris Bourse"* (Journal of Finance).
   - Formulates the state-dependent transition probabilities of order flow events (limit orders at touch, market orders, order cancellations) conditional on spread width and queue depth.
   - Evaluates liquidity replenishment rate, spread widening risk, and resiliency half-life.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/tree/exchange/direct/bybit-rest-client.ts` (129 LOC) decomposed into:
     - `bybit-rest-request.ts` ($\le 45$ LOC): URL query formatting and signature generation.
     - `bybit-rest-response.ts` ($\le 35$ LOC): Error message extraction and JSON handling.
     - `bybit-rest-client.ts` ($\le 40$ LOC facade): Re-export/clean class delegate.
   - `src/tree/exchange/direct/ticker-normalizer.ts` (128 LOC) decomposed into:
     - `ticker-normalizer-binance.ts` ($\le 45$ LOC): Binance ticker normalization & validator.
     - `ticker-normalizer-exchanges.ts` ($\le 45$ LOC): OKX & Bybit normalization.
     - `ticker-normalizer.ts` ($\le 30$ LOC facade): Re-export facade.
4. **Pillar 4: Testing & Verification Gate**:
   - Unit tests: `test/quant/kratz-schoneborn-execution.test.ts`
   - Unit tests: `test/quant/biais-hillion-spatt-microstructure.test.ts`
   - Cross-domain integration test: `test/quant/v35-apex-suite-simulation.test.ts`
   - 100% green tests (5,690+ tests), 0 `:any`, 0 ESLint warnings, all source files strictly $\le 48$ LOC.
