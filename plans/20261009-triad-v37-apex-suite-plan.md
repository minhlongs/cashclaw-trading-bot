# Plan: Triad v37 Apex Multi-Domain Quantitative & Architecture Suite

## Context & Objectives
Following the completion, git commit (`f7aace7`), and memory indexing of Triad v36 Apex Suite (5,703/5,703 green tests across 549 test files, 0 `:any`, 0 ESLint warnings, all source files strictly $\le 46$ LOC), the user selected "Cả 3 trụ cột (Recommended)" and confirmed "Yes, lập plan và triển khai (Recommended)" for **Triad v37 Apex Multi-Domain Quantitative & Architecture Suite**:
1. **Pillar 1: Alfonsi-Fruth-Schied (2010) Optimal Execution with Non-Linear Resilient Limit Order Book Engine** (`src/tree/quantlib/execution/`):
   - Academic foundation: Aurélien Alfonsi, Antje Fruth, and Alexander Schied (2010) *"Optimal Execution Strategies in the Presence of a Limit Order Book"* (Mathematical Finance).
   - Formulates optimal liquidation strategies in a resilient LOB where book depth shape is non-linear and impact relaxes with exponential speed $\kappa$.
   - Computes execution trajectories, resilience-adjusted impact recovery, VWAP price, and terminal shortfall.
2. **Pillar 2: Parlour (1998) Dynamic Limit Order Book Equilibrium & Queue Priority Engine** (`src/tree/quantlib/microstructure/`):
   - Academic foundation: Christine A. Parlour (1998) *"Dynamic Limit Order Markets"* (Review of Financial Studies).
   - Models the strategic trade-off between limit and market orders taking into account queue externalities, length priority $Q$, cancellation probability, and execution latency.
   - Computes queue fill probability, execution latency, market order incentive premium, and optimal order type selection.
3. **Pillar 3: Structural Deep Modularization (< 50 LOC per file)**:
   - `src/forest/alpha/persistence/json-adapter.ts` (128 LOC) decomposed into:
     - `json-adapter-fs.ts` ($\le 30$ LOC): `readFile`, `writeFile`, `fromJson`, `toJson`.
     - `json-adapter-experiments.ts` ($\le 45$ LOC): `toStoredExperiment`, `listStoredExperiments`.
     - `json-adapter.ts` ($\le 45$ LOC facade): `JsonPersistenceAdapter`, `createJsonAdapter`.
   - `src/forest/alpha/cross-sectional-eval/attribution.ts` (128 LOC) decomposed into:
     - `attribution-long-short.ts` ($\le 45$ LOC): `attributeLongShortPrecise`, `attributeLongShortProportional`.
     - `attribution-costs.ts` ($\le 38$ LOC): `attributeCosts`.
     - `attribution.ts` ($\le 25$ LOC facade): Re-exports and interfaces.
4. **Pillar 4: Testing & Verification Gate**:
   - `test/quant/alfonsi-fruth-execution.test.ts`
   - `test/quant/parlour-orderbook-equilibrium.test.ts`
   - `test/quant/v37-apex-suite-simulation.test.ts`
   - Quality checks:
     - `npm run type-check` (0 errors)
     - `npm run lint` (0 warnings)
     - `npm test` (100% green tests, > 5,710 tests)
     - All source files strictly $\le 48$ LOC.
