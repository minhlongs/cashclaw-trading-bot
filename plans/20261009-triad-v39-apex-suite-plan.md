# Implementation Plan: Triad v39 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion, git commit (`78ad86d`), and memory indexing of Triad v38 Apex Suite (5,719/5,719 green tests across 555 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 40$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and confirmed "Yes, lập plan và triển khai (Recommended)" for **Triad v39 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Lorenz-Almgren (2011) Mean-Variance Optimal Adaptive Execution Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Christopher Lorenz and Robert Almgren (2011) *"Mean-Variance Optimal Adaptive Execution"* (Applied Mathematical Finance).
   - Solves the dynamic mean-variance optimal liquidation problem where execution rate adapts to price moves:
     $$v_t^* = \kappa_t q_t \cdot \left[1 + \beta \frac{P_t - P_0}{\sigma P_0}\right]$$
     with dynamic variance risk aversion $\lambda$, trade speed dampening, and VWAP benchmark comparisons.
2. **Pillar 2: Copeland-Galai (1983) Options Model of Bid-Ask Spread Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Thomas E. Copeland and Dan Galai (1983) *"Information Effects on the Bid-Ask Spread"* (Journal of Finance).
   - Formulates the bid-ask spread as the dealer writing two options (a put option to sellers at the bid and a call option to buyers at the ask) facing informed and uninformed traders:
     $$S^* = C(S_0, K_a, \sigma, \tau) + P(S_0, K_b, \sigma, \tau) + \frac{c_{\text{order}}}{P_{\text{uninformed}}}$$
     calculating dealer option liability, expected uninformed revenue, and zero-profit equilibrium spread.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/forest/settings/actions.ts` (125 LOC) decomposed into:
     - `actions-validation.ts` ($\le 40$ LOC): Configuration validation & parsing.
     - `actions-d1.ts` ($\le 45$ LOC): Direct D1 persistence operations.
     - `actions.ts` ($\le 40$ LOC facade): Server actions facade.
   - `src/forest/api/handlers/bot-detail.ts` (125 LOC) decomposed into:
     - `bot-detail-metrics.ts` ($\le 45$ LOC): PnL and trade statistics aggregation.
     - `bot-detail-orders.ts` ($\le 45$ LOC): Order history formatting and telemetry extraction.
     - `bot-detail.ts` ($\le 40$ LOC facade): API handler route facade.
4. **Pillar 4: Testing & Verification Gate**:
   - Unit tests for Lorenz-Almgren execution (`test/quant/lorenz-almgren-execution.test.ts`).
   - Unit tests for Copeland-Galai spread microstructure (`test/quant/copeland-galai-spread.test.ts`).
   - Cross-domain E2E simulation test (`test/quant/v39-apex-suite-simulation.test.ts`).
   - Verification of 100% green tests (> 5,725 tests), 0 `:any`, 0 ESLint warnings, all source files strictly $\le 45$ LOC.

---

## Technical Specifications & Architecture

### Pillar 1: Lorenz-Almgren (2011) Mean-Variance Adaptive Execution Engine
- **Files**:
  - `src/tree/quantlib/execution/lorenz-almgren-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/execution/lorenz-almgren-engine.ts` ($\le 40$ LOC)
- **Formulation**:
  - `LorenzAlmgrenParams`:
    `initialShares`, `initialPrice`, `numSteps`, `timeHorizon`, `volatility`, `riskAversion`, `temporaryImpact`, `priceDriftSensitivity`.
  - `LorenzAlmgrenStep`:
    `step`, `time`, `sharesExecuted`, `sharesRemaining`, `adaptiveSpeedFactor`, `executionPrice`, `stepCost`.
  - `LorenzAlmgrenResult`:
    `trajectory`, `totalCost`, `vwapPrice`, `meanVarianceUtility`, `terminalShares`.

### Pillar 2: Copeland-Galai (1983) Options Model of Bid-Ask Spread Engine
- **Files**:
  - `src/tree/quantlib/microstructure/copeland-galai-types.ts` ($\le 25$ LOC)
  - `src/tree/quantlib/microstructure/copeland-galai-engine.ts` ($\le 40$ LOC)
- **Formulation**:
  - `CopelandGalaiParams`:
    `assetPrice`, `volatility`, `timeToQuoteExpirySec`, `informedTraderFraction`, `orderHandlingCost`, `interestRate?`.
  - `CopelandGalaiResult`:
    `equilibriumSpread`, `halfSpread`, `callOptionLiability`, `putOptionLiability`, `uninformedGainThreshold`, `optimalBid`, `optimalAsk`.

### Pillar 3: Structural Deep Modularization (< 50 LOC per file)
- `src/forest/settings/actions-validation.ts` ($\le 40$ LOC)
- `src/forest/settings/actions-d1.ts` ($\le 45$ LOC)
- `src/forest/settings/actions.ts` ($\le 40$ LOC facade)
- `src/forest/api/handlers/bot-detail-metrics.ts` ($\le 45$ LOC)
- `src/forest/api/handlers/bot-detail-orders.ts` ($\le 45$ LOC)
- `src/forest/api/handlers/bot-detail.ts` ($\le 40$ LOC facade)

### Pillar 4: Testing & Verification Plan
- Unit tests: `test/quant/lorenz-almgren-execution.test.ts`
- Unit tests: `test/quant/copeland-galai-spread.test.ts`
- Integration test: `test/quant/v39-apex-suite-simulation.test.ts`
- Quality checks:
  - `npm run type-check` (0 errors)
  - `npm run lint` (0 warnings)
  - `npm test` (100% green tests)
- Documentation: update `docs/development-roadmap.md`, `docs/project-changelog.md`, and memory file.
