# Plan: Triad v20 Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the completion and verification of Triad v19 (`0e232cb`, 5,542/5,542 tests passing), Triad v20 advances both quantitative trading engines and codebase modularization with strict file size constraints (< 75 LOC/file).

## Objectives & Pillars
1. **Pillar 1: Garman-Klass (1980) & Parkinson (1980) Volatility Engine**:
   - `src/tree/quantlib/volatility/garman-klass-volatility-types.ts` (<= 30 LOC)
   - `src/tree/quantlib/volatility/garman-klass-volatility-engine.ts` (<= 75 LOC)
   - High-low Parkinson range variance & open-high-low-close Garman-Klass extreme-value estimator with overnight jump adjustment.
2. **Pillar 2: Hasbrouck (1991) VAR Trade Informativeness Microstructure Engine**:
   - `src/tree/quantlib/microstructure/hasbrouck-var-types.ts` (<= 30 LOC)
   - `src/tree/quantlib/microstructure/hasbrouck-var-engine.ts` (<= 75 LOC)
   - Bivariate Vector Autoregression decomposing quote revisions into permanent information shocks vs transitory noise.
3. **Pillar 3: Deep Observability & Data Quality Modularization (< 75 LOC/file)**:
   - `src/tree/alpha/observability/attribution-telemetry.ts` (135 -> 62 LOC) -> extract stats (`attribution-telemetry-stats.ts`, <= 35 LOC) and processor (`attribution-telemetry-processor.ts`, <= 60 LOC).
   - `src/tree/alpha/data-quality/validator.ts` (134 -> 60 LOC) -> extract runners (`validator-runners.ts`, <= 70 LOC).
4. **Pillar 4: Comprehensive Testing & Quality Gates**:
   - `test/quant/garman-klass-volatility-engine.test.ts`
   - `test/quant/hasbrouck-var-engine.test.ts`
   - `test/quant/v20-apex-suite-simulation.test.ts`
   - Maintain 100% green test suite (5,550+ tests), 0 `:any` types, 0 ESLint warnings.
