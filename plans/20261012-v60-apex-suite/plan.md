# Plan: Triad v60 Golden Apex Multi-Domain Quantitative & Architecture Suite

status: ready
created: 2026-10-12
objective: Implement extreme-value volatility estimators, execution quality microstructure decomposition, and deep micro-modularization under strict <= 36 LOC per file constraint.

## Architecture & Mathematical Foundations

### 1. Garman & Klass (1980) High-Efficiency OHLC Volatility Engine
- **Files**:
  - `src/tree/quantlib/volatility/garman-klass-volatility-types.ts` (<= 20 LOC)
  - `src/tree/quantlib/volatility/garman-klass-volatility-engine.ts` (<= 32 LOC)
- **Mathematical Specification**:
  - Classic OHLC estimator with ~7.4x efficiency gain relative to close-to-close returns:
    $$\sigma^2_{GK} = \frac{1}{N} \sum_{i=1}^N \left[ 0.5 \left(\ln\frac{H_i}{L_i}\right)^2 - (2\ln 2 - 1) \left(\ln\frac{C_i}{O_i}\right)^2 \right]$$
  - Output: annualized volatility $\sigma_{GK} = \sqrt{\sigma^2_{GK} \cdot \text{scale}}$, efficiency ratio, variance.

### 2. Parkinson (1980) High-Low Diffusion Volatility Engine
- **Files**:
  - `src/tree/quantlib/volatility/parkinson-volatility-types.ts` (<= 20 LOC)
  - `src/tree/quantlib/volatility/parkinson-volatility-engine.ts` (<= 30 LOC)
- **Mathematical Specification**:
  - Extreme-value diffusion estimator based on continuous sample paths of Brownian motion:
    $$\sigma^2_P = \frac{1}{4 \ln 2 \cdot N} \sum_{i=1}^N \left(\ln\frac{H_i}{L_i}\right)^2$$
  - Output: annualized volatility $\sigma_P = \sqrt{\sigma^2_P \cdot \text{scale}}$, scale-adjusted variance.

### 3. Yang & Zhang (2000) Drift-Independent & Overnight Jump Volatility Engine
- **Files**:
  - `src/tree/quantlib/volatility/yang-zhang-volatility-types.ts` (<= 22 LOC)
  - `src/tree/quantlib/volatility/yang-zhang-volatility-engine.ts` (<= 35 LOC)
- **Mathematical Specification**:
  - Combines overnight jump variance $\sigma^2_o$, open-to-close variance $\sigma^2_c$, and Rogers-Satchell drift-independent variance $\sigma^2_{RS}$:
    $$\sigma^2_{YZ} = \sigma^2_o + k \sigma^2_c + (1 - k) \sigma^2_{RS}, \quad k = \frac{0.34}{1.34 + \frac{N+1}{N-1}}$$
    $$\sigma^2_{RS} = \frac{1}{N} \sum_{i=1}^N \left[ \ln\frac{H_i}{C_i} \ln\frac{H_i}{O_i} + \ln\frac{L_i}{C_i} \ln\frac{L_i}{O_i} \right]$$
  - Handles non-zero drift and price jumps across market trading sessions.

### 4. Bessembinder & Kaufman (1997) Execution Quality Spread Decomposition Engine
- **Files**:
  - `src/tree/quantlib/microstructure/bessembinder-kaufman-types.ts` (<= 22 LOC)
  - `src/tree/quantlib/microstructure/bessembinder-kaufman-engine.ts` (<= 32 LOC)
- **Mathematical Specification**:
  - Decomposes effective half-spread into realized spread (liquidity provider compensation) and price impact (adverse selection friction):
    $$\text{Effective Half Spread} = q_t (P_t - M_t)$$
    $$\text{Realized Half Spread} = q_t (P_t - M_{t+\tau})$$
    $$\text{Price Impact} = q_t (M_{t+\tau} - M_t)$$
    $$\text{Identity check}: \text{Effective} = \text{Realized} + \text{Price Impact}$$

### 5. Deep Production Micro-Modularization (<= 36 LOC per file)
1. **`src/tree/exchange/provider/exchange-router.ts`** (115 LOC -> <= 36 LOC facade):
   - `src/tree/exchange/provider/exchange-router-types.ts` (<= 24 LOC): `ExchangeRouteHealth`, `RouteContext`.
   - `src/tree/exchange/provider/exchange-router-pinned.ts` (<= 30 LOC): `routePinned()` logic.
   - `src/tree/exchange/provider/exchange-router-health.ts` (<= 32 LOC): `routeBestHealth()` and `isCircuitOpen()`.
   - `src/tree/exchange/provider/exchange-router.ts` (<= 36 LOC facade): Orchestrates strategies and round-robin.
2. **`src/tree/research/evidence/lineage.ts`** (117 LOC -> <= 36 LOC facade):
   - `src/tree/research/evidence/lineage-types.ts` (<= 24 LOC): `ResearchLineage`, `SpawnGuardResult`.
   - `src/tree/research/evidence/lineage-builder.ts` (<= 36 LOC): `buildLineage()` graph construction and traversals.
   - `src/tree/research/evidence/lineage-guard.ts` (<= 28 LOC): `spawnFromFalsified()` validation guard.
   - `src/tree/research/evidence/lineage.ts` (<= 16 LOC facade): Backward-compatible re-exports.

---

## Verification & Quality Gates
- Unit test files:
  - `test/quant/garman-klass-volatility.test.ts`
  - `test/quant/parkinson-volatility.test.ts`
  - `test/quant/yang-zhang-volatility.test.ts`
  - `test/quant/bessembinder-kaufman.test.ts`
  - `test/quant/v60-apex-suite-simulation.test.ts`
- Existing tests: `exchange-router.test.ts`, `lineage.test.ts`, `routing-paper-only.test.ts` must pass 100%.
- Quality commands:
  - `npm run type-check` (0 errors, 0 `:any`)
  - `npm run lint` (0 warnings)
  - `npm test` (100% passing tests)
  - Invariant check: all new/modified files <= 36 LOC.
- Documentation: update `docs/project-changelog.md`, `docs/development-roadmap.md`, and persistent memory.
