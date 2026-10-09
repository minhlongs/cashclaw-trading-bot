# Plan: Triad v34 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion, git commit (`51f45fc`), and memory indexing of Triad v33 Apex Suite (5,680/5,680 green tests across 540 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 39$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and confirmed the implementation plan for **Triad v34 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Kyle-Roşu (2019) High-Frequency Informed Trading & Liquidity Execution Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Kyle & Roşu (2019) *"Liquidity and Price Discovery in High-Frequency Trading"*.
   - Dynamic continuous-time informed liquidation against noise traders with price-dependent aggressiveness $\beta(v - P_t)$, Kyle's lambda depth $\lambda = \sigma_v / \sigma_u$, and information revelation metric $I_t$.
2. **Pillar 2: Foucault-Roşu (2019) Fast-Trader Liquidity & High-Frequency Adverse Selection Microstructure Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Foucault & Roşu (2019) *"Liquidity and Fast Trading"* (Journal of Financial Economics).
   - High-frequency limit order book quoting with quote sniping risk $P_{\text{sniped}} = \frac{\lambda_{\text{fast}}}{\lambda_{\text{fast}} + \mu_{\text{cancel}}}$, equilibrium spread determination, and fast trader economic rent.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/tree/exchange/queue/queued-adapter.ts` (130 LOC $\rightarrow$ $\le 45$ LOC facade via `queued-adapter-market.ts`).
   - `src/tree/exchange/provider/circuit-breaker-state.ts` (130 LOC $\rightarrow$ $\le 45$ LOC class via `circuit-breaker-transitions.ts`).
4. **Pillar 4: Testing & Verification Gate**:
   - Unit tests for Kyle-Roşu execution (`test/quant/kyle-rosu-execution.test.ts`).
   - Unit tests for Foucault-Roşu microstructure (`test/quant/foucault-rosu-microstructure.test.ts`).
   - Cross-domain E2E simulation test (`test/quant/v34-apex-suite-simulation.test.ts`).
   - 100% green tests (5,690+ tests), 0 `:any`, 0 ESLint warnings, all source files strictly $\le 45$ LOC.
