# Plan: Triad v38 Apex Multi-Domain Quantitative & Architecture Suite

## Context & Objectives
Following the completion, git commit (`f2065cf`), and memory indexing of Triad v37 Apex Suite (5,712/5,712 green tests across 552 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 46$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and confirmed "Yes, lập plan và triển khai (Recommended)" for **Triad v38 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Bouchaud-Farmer-Lillo (2009) Long-Memory Order Flow & Non-Markovian Impact Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: J.-P. Bouchaud, J. D. Farmer, F. Lillo (2009) *"How Markets Slowly Digest Changes in Supply and Demand"* (Handbook of Financial Markets).
   - Models order flow persistence with long-memory power-law auto-correlation $C(l) = \langle \epsilon_n \epsilon_{n+l} \rangle \sim l^{-\gamma}$ ($\gamma \in (0, 1)$, Hurst exponent $H = 1 - \gamma/2$).
   - Formulates bare impact $G_0$ vs dressed/bare response functions, ensuring market efficiency despite long-memory sign correlation.
   - Computes execution trajectories, long-memory correlation decay, dressed impact, and VWAP execution prices.
2. **Pillar 2: Foucault-Kadan-Kandel (2005) Limit Order Book Waiting Times & Liquidity Provider Equilibrium Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Thierry Foucault, Ohad Kadan, Eugene Kandel (2005) *"Limit Order Book as a Market for Liquidity"* (Review of Financial Studies).
   - Formulates the equilibrium between impatient market orders and patient limit orders as a game of waiting times: $E[T_{\text{wait}}] = \frac{Q + 1}{\lambda_{\text{market}}}$, reservation bid-ask spread $S^*$, fill probability before order expiration, and optimal placement threshold.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/forest/bot/scheduler.ts` (124 LOC) decomposed into:
     - `scheduler-types.ts` ($\le 25$ LOC): Interfaces and options.
     - `scheduler-tick.ts` ($\le 45$ LOC): Bot execution tick logic.
     - `scheduler.ts` ($\le 45$ LOC facade): `BotScheduler` class and lifecycle management.
   - `src/tree/bot/bot-order-executor.ts` (124 LOC) decomposed into:
     - `bot-order-executor-validation.ts` ($\le 38$ LOC): Parameter validation and guard checks.
     - `bot-order-executor-calc.ts` ($\le 42$ LOC): Sizing and price calculation.
     - `bot-order-executor.ts` ($\le 45$ LOC facade): Main execution orchestration.
4. **Pillar 4: Testing & Verification Gate**:
   - `test/quant/bouchaud-farmer-execution.test.ts`
   - `test/quant/foucault-kadan-orderbook.test.ts`
   - `test/quant/v38-apex-suite-simulation.test.ts`
   - Quality checks:
     - `npm run type-check` (0 errors)
     - `npm run lint` (0 warnings)
     - `npm test` (100% green tests, > 5,720 tests)
     - All source files strictly $\le 48$ LOC.
