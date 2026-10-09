# Plan: Triad v36 Apex Multi-Domain Quantitative & Architecture Suite

## Context & Objectives
Following the completion, git commit (`5bbed67`), and memory indexing of Triad v35 Apex Suite (5,694/5,694 green tests across 546 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 46$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and confirmed "Yes, lập plan và triển khai (Recommended)" for **Triad v36 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Gatheral-Schied-Slynko (2012) Transient Market Impact & Resilient Nonlinear Price Manipulation Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Jim Gatheral, Alexander Schied, and Alla Slynko (2012) *"Transient Market Impact and Convexity/No-Arbitrage"* & *"Exponential and Power-Law Decay Functions"*.
   - Models optimal execution under transient impact with Fredholm integral kernels $G(t-s) = e^{-\rho(t-s)}$ or power-law decay.
   - Enforces completely monotonic kernels guaranteeing strict positive execution costs ($C \ge 0$) on all round trips, barring price manipulation and statistical arbitrage.
   - Computes execution trajectory, transient impact drift, price reversion path, and VWAP execution price.
2. **Pillar 2: Roşu (2009) Dynamic Limit Order Book Choice & Endogenous Liquidity Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Ioanid Roşu (2009) *"A Dynamic Model of the Limit Order Book"* (Review of Financial Studies).
   - Formulates the endogenous equilibrium trade-off between market orders (immediacy) and limit orders (spread-earning) under impatient liquidity consumers and providers.
   - Computes equilibrium bid-ask spread $S^* = \frac{2r}{\lambda} + \Delta$, limit order fill probability, immediacy price premium, and LOB depth distribution.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/tree/bot/bot-manager-helpers.ts` (128 LOC) decomposed into:
     - `bot-manager-d1-status.ts` ($\le 35$ LOC): `toD1Status`, `D1CallbackDeps`, `persistNewBot`.
     - `bot-manager-default-config.ts` ($\le 45$ LOC): `defaultConfigFromRow`.
     - `bot-manager-helpers.ts` ($\le 35$ LOC): `createD1Callbacks` and clean re-exports.
   - `src/tree/alpha/cross-sectional/beta-estimation.ts` (128 LOC) decomposed into:
     - `beta-estimation-pairs.ts` ($\le 45$ LOC): `requirePositiveInteger`, `requireAlignedSeries`, `alignedPairs`, `variance`.
     - `beta-estimation.ts` ($\le 45$ LOC): `BetaScaleConfig`, `BetaScaleResult`, `estimateRollingBetas`.
4. **Pillar 4: Testing & Verification Gate**:
   - `test/quant/gatheral-schied-execution.test.ts`
   - `test/quant/rosu-orderbook-choice.test.ts`
   - `test/quant/v36-apex-suite-simulation.test.ts`
   - Quality checks:
     - `npm run type-check` (0 errors)
     - `npm run lint` (0 warnings)
     - `npm test` (100% green tests, > 5,700 tests)
     - All source files strictly $\le 48$ LOC.
