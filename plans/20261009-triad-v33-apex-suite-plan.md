# Implementation Plan: Triad v33 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion, git commit (`4a4cdc5`), and memory indexing of Triad v32 Apex Suite (5,669/5,669 green tests across 537 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 44$ LOC), the user selected "Cả 3 trụ cột (Recommended)" for **Triad v33 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Almgren-Lorenz (2007) Adaptive Arrival Price Execution Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Almgren & Lorenz (2007) *"Adaptive Arrival Price"* (Journal of Risk).
   - Formulates state-dependent, adaptive execution schedules where liquidation speed reacts dynamically to observed price drift / volatility shocks:
     $$v_t^* = \kappa S_t \cdot \left(1 + \beta \frac{P_t - P_0}{\sigma \sqrt{t}}\right)$$
   - Dynamically accelerates when price moves favorably and decelerates under adverse price movements to capture opportunistic liquidity while controlling liquidation variance.
2. **Pillar 2: Easley-O'Hara (1987) Trade-Size Information Asymmetry Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Easley & O'Hara (1987) *"Price, Trade Size, and Information in Securities Markets"* (Journal of Financial Economics).
   - Models how informed traders prefer large orders to monetize ephemeral private signals, leading to size-dependent adverse selection:
     $$P(\text{Informed} \mid \text{Large}) = \frac{\mu \alpha}{\mu \alpha + 2 \epsilon_L}, \quad P(\text{Informed} \mid \text{Small}) = \frac{(1 - \mu) \alpha}{(1 - \mu) \alpha + 2 \epsilon_S}$$
   - Evaluates size-stratified adverse selection spread markups ($S_{\text{large}} > S_{\text{small}}$) and information asymmetry ratios.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/forest/research/tradingagents/model-router-execute.ts` (130 LOC) decomposed into:
     - `model-router-attempt.ts` ($\le 45$ LOC): Provider call attempt with race timeout and latency timing.
     - `model-router-fallback.ts` ($\le 45$ LOC): Fallback provider execution and provenance error handling.
     - `model-router-execute.ts` ($\le 30$ LOC facade): Re-export facade.
   - `src/forest/alpha/research-agent/mock-provider.ts` (130 LOC) decomposed into:
     - `mock-provider-types.ts` ($\le 45$ LOC): Interfaces and options.
     - `mock-provider-dispatch.ts` ($\le 45$ LOC): Fixture resolution and clustering response generation.
     - `mock-provider.ts` ($\le 45$ LOC facade/class): Thin class encapsulating state and calling pure dispatchers.
4. **Pillar 4: Testing & Verification Gate**:
   - Unit tests for Almgren-Lorenz execution (`test/quant/almgren-lorenz-execution.test.ts`).
   - Unit tests for Easley-O'Hara trade-size information asymmetry (`test/quant/easley-ohara-trade-size.test.ts`).
   - Cross-domain E2E simulation test (`test/quant/v33-apex-suite-simulation.test.ts`).
   - Verification of 100% green tests (5,677+ tests), 0 `:any`, 0 ESLint warnings, all source files strictly $\le 45$ LOC.

---

## Technical Specifications & Architecture

### Pillar 1: Almgren-Lorenz (2007) Adaptive Execution Engine
- **Files**:
  - `src/tree/quantlib/execution/almgren-lorenz-types.ts` ($\le 25$ LOC)
  - `src/tree/quantlib/execution/almgren-lorenz-engine.ts` ($\le 45$ LOC)
- **Formulation**:
  - `AlmgrenLorenzParams`:
    `totalShares`, `timeHorizon`, `numSteps`, `volatility`, `urgencyCoeff`, `adaptiveSensitivity`, `initialPrice`, `temporaryImpactCoeff`, `priceTrajectory?`.
  - `AlmgrenLorenzStep`:
    `step`, `sharesRemaining`, `tradeSize`, `tradeSpeed`, `currentPrice`, `adaptiveSpeedFactor`, `executionPrice`, `stepCost`.
  - `AlmgrenLorenzResult`:
    `trajectory`, `totalCost`, `vwapPrice`, `adaptationBenefit`, `terminalShares`.

### Pillar 2: Easley-O'Hara (1987) Trade-Size Information Asymmetry Engine
- **Files**:
  - `src/tree/quantlib/microstructure/easley-ohara-types.ts` ($\le 25$ LOC)
  - `src/tree/quantlib/microstructure/easley-ohara-engine.ts` ($\le 45$ LOC)
- **Formulation**:
  - `EasleyOharaParams`:
    `eventProbability`, `informedLargeFraction`, `uninformedSmallRate`, `uninformedLargeRate`, `informedRate`, `baseAssetPrice`, `volatility`.
  - `EasleyOharaResult`:
    `pinLarge`, `pinSmall`, `spreadLargeBps`, `spreadSmallBps`, `sizeAsymmetryRatio`, `largeOrderAdverseSelectionMarkup`.

### Pillar 3: Structural Deep Modularization (< 50 LOC per file)
- `src/forest/research/tradingagents/model-router-attempt.ts` ($\le 45$ LOC)
- `src/forest/research/tradingagents/model-router-fallback.ts` ($\le 45$ LOC)
- `src/forest/research/tradingagents/model-router-execute.ts` ($\le 30$ LOC)
- `src/forest/alpha/research-agent/mock-provider-types.ts` ($\le 45$ LOC)
- `src/forest/alpha/research-agent/mock-provider-dispatch.ts` ($\le 45$ LOC)
- `src/forest/alpha/research-agent/mock-provider.ts` ($\le 45$ LOC)

### Pillar 4: Testing & Verification Plan
- Unit tests `test/quant/almgren-lorenz-execution.test.ts`
- Unit tests `test/quant/easley-ohara-trade-size.test.ts`
- Integration test `test/quant/v33-apex-suite-simulation.test.ts`
- Quality checks:
  - `npm run type-check` (0 errors)
  - `npm run lint` (0 warnings)
  - `npm test` (100% green tests)
- Documentation: update `docs/development-roadmap.md`, `docs/project-changelog.md`, and memory file.
