# Plan: Triad v40 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion, git commit (`aad4b78`), and memory indexing of Triad v39 Apex Suite (5,726/5,726 green tests across 558 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 39$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and "Yes, lập plan và triển khai (Recommended)" for **Triad v40 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Cartea-Jaimungal (2014) Optimal High-Frequency Execution with Alpha Drift Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Cartea & Jaimungal (2014) *"Risk Metrics and Fine Tuning of High-Frequency Trading Strategies"* & *"Algorithmic and High-Frequency Trading"* (2015).
   - Formulates stochastic optimal execution where instantaneous speed $\nu_t^*$ incorporates both inventory penalty and dynamic predictive alpha drift $\alpha_t$:
     $$\nu_t^* = \frac{q_t \cdot \zeta \coth(\zeta (T - t))}{1} + \frac{\alpha_t}{2 \eta}$$
     where $\zeta = \sqrt{\frac{\phi}{\eta}}$, $\phi$ is holding inventory risk aversion, and $\eta$ is temporary market impact.
2. **Pillar 2: Roll (1984) Implicit Bid-Ask Spread & Serial Covariance Microstructure Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Richard Roll (1984) *"A Simple Implicit Measure of the Effective Bid-Ask Spread in an Efficient Market"* (Journal of Finance).
   - Models market friction where true prices follow a random walk and observed price changes $\Delta P_t$ exhibit negative serial autocovariance due to order bounce between bid and ask:
     $$\text{Cov}(\Delta P_t, \Delta P_{t-1}) = - \frac{S^2}{4} \implies S^* = 2 \sqrt{\max(0, -\text{Cov}(\Delta P_t, \Delta P_{t-1}))}$$
   - Includes handling for positive serial covariance (zero or heuristic effective spread), tick fraction sizing, and transaction cost estimation.
3. **Pillar 3: Structural Deep Modularization (< 40 LOC per file)**:
   - `src/app/api/settings/route.ts` (124 LOC) decomposed into:
     - `src/app/api/settings/schema.ts` ($\le 38$ LOC): Zod schemas for exchange, risk, killswitch, notification.
     - `src/app/api/settings/handlers.ts` ($\le 38$ LOC): Action delegation handlers.
     - `src/app/api/settings/route.ts` ($\le 38$ LOC): Clean GET / POST route handler facade.
   - `src/forest/alpha/evaluation/report-helpers.ts` (124 LOC) decomposed into:
     - `src/forest/alpha/evaluation/report-stats.ts` ($\le 38$ LOC): `median`, `classifyVol`, `monthKey`, `computeSortino`.
     - `src/forest/alpha/evaluation/report-drawdown.ts` ($\le 38$ LOC): `computeMaxDrawdown`, `durationBucket`.
     - `src/forest/alpha/evaluation/report-helpers.ts` ($\le 38$ LOC): `reportFromTrades`, `emptyPartial` and re-exports.
4. **Pillar 4: Testing & Verification Gate**:
   - Unit tests for Cartea-Jaimungal execution (`test/quant/cartea-jaimungal-execution.test.ts`).
   - Unit tests for Roll spread microstructure (`test/quant/roll-spread.test.ts`).
   - Cross-domain E2E simulation test (`test/quant/v40-apex-suite-simulation.test.ts`).
   - Verification of 100% green tests, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 39$ LOC.
