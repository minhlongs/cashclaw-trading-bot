# Brainstorming Report: Triad v20 Apex Multi-Domain Quantitative & Architecture Suite

**Date:** 2026-10-09  
**Status:** Consensus Achieved / Ready for Implementation  
**Principles:** YAGNI, KISS, DRY, Zero `:any`, Strict LOC Governance (< 75 LOC/file)

---

## 1. Problem Statement & Objectives

With the successful deployment of Triad v19 (Yang-Zhang Continuous Volatility, Stoikov OFI Micro-Price, and Attribution/Order-Generator modularization), the trading bot codebase requires further mathematical rigor and architecture refactoring for ultra-high-frequency statistical arbitrage and market microstructure analysis:

1. **Intraday Extreme-Value Volatility Gap**:
   - Classical close-to-close estimators discard intraday extrema, requiring large sample sizes to converge.
   - Yang-Zhang handles drift and gaps well, but for intraday algorithmic order execution, high-frequency extreme-value estimators like **Garman-Klass (1980)** and **Parkinson (1980)** provide up to $8\times$ the statistical efficiency of standard sample variance with low computational latency.
2. **Trade Flow Informativeness & Adverse Selection Quantification**:
   - Existing microstructure engines (Kyle Lambda, Cont-de Larrard, Stoikov Micro-Price) model instantaneous queue imbalance, but lack the structural capacity to decompose price revisions into permanent information shocks vs. transient liquidity bounces over multi-tick horizons.
   - **Joel Hasbrouck (1991)** Vector Autoregressive (VAR) trade informativeness provides the canonical econometric tool to isolate informed trading shocks from market maker inventory frictions.
3. **Architectural Technical Debt & File Size Bloat**:
   - Core data quality and observability engines contain files exceeding 130 LOC:
     - `src/tree/alpha/observability/attribution-telemetry.ts` (135 LOC): Accumulates statistical distributions, alert generators, and provider tracking in a single file.
     - `src/tree/alpha/data-quality/validator.ts` (134 LOC): Houses 9 validator runner definitions and evaluation pipelines in one monolithic block.
   - Refactoring is required to enforce the strict project standard of $\le 75$ LOC per file without breaking any public interfaces.

---

## 2. Evaluated Approaches & Trade-Off Analysis

| Approach | Architecture & Scope | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Option A: Pure Quantitative Focus** | Implement Garman-Klass/Parkinson & Hasbrouck VAR only; skip modularization. | Rapid implementation, concentrated quant tests. | Leaves 2 critical observability files > 130 LOC, violating clean architecture rules. | **Rejected** |
| **Option B: Pure Architecture Cleanup** | Refactor all files > 100 LOC across the codebase without adding new quant engines. | Low algorithmic risk, reduces technical debt. | Zero enhancement to quant trading alpha or execution edge. | **Rejected** |
| **Option C: Triad v20 Comprehensive Multi-Domain Suite (Recommended)** | 1. Garman-Klass (1980) & Parkinson Volatility Engine.<br>2. Hasbrouck (1991) Structural VAR Microstructure Engine.<br>3. Modularize `attribution-telemetry.ts` and `validator.ts` (< 75 LOC/file).<br>4. Full Unit & Multi-Domain E2E Simulation Test Suite. | Maximizes mathematical fidelity, maintains 100% green tests, enforces strict LOC limits. | Requires careful VAR matrix inversion handling and backward-compatible facade design. | **Selected (Unanimous)** |

---

## 3. Mathematical & Algorithmic Foundations

### Pillar 1: Garman-Klass (1980) & Parkinson (1980) Extreme-Value Volatility Engine
- **Parkinson (1980)** High-Low Range Variance:
  $$\sigma_{\text{P}}^2 = \frac{1}{4 \ln 2 \cdot N} \sum_{t=1}^N \left(\ln \frac{H_t}{L_t}\right)^2$$
- **Garman-Klass (1980)** Extreme-Value Variance:
  $$\sigma_{\text{GK}}^2 = \frac{1}{N} \sum_{t=1}^N \left[ 0.5 \left(\ln \frac{H_t}{L_t}\right)^2 - (2\ln 2 - 1) \left(\ln \frac{C_t}{O_t}\right)^2 \right]$$
  where $(2\ln 2 - 1) \approx 0.386294$.
- **Garman-Klass-Yang-Zhang (GKYZ)** Jump-Adjusted Variance:
  $$\sigma_{\text{GKYZ}}^2 = \frac{1}{N} \sum_{t=1}^N \left[ \left(\ln \frac{O_t}{C_{t-1}}\right)^2 + 0.5 \left(\ln \frac{H_t}{L_t}\right)^2 - (2\ln 2 - 1) \left(\ln \frac{C_t}{O_t}\right)^2 \right]$$
- **Annualized Volatility**:
  $$\sigma_{\text{ann}} = \sqrt{\max(0, \sigma^2) \times \text{annualizationFactor}}$$

### Pillar 2: Hasbrouck (1991) Vector Autoregressive (VAR) Trade Informativeness Engine
- Trade-by-trade log quote midpoint return $r_t = \Delta \ln(P_{\text{mid}, t})$ and signed trade indicator $x_t \in \{-1, 0, +1\}$ (or volume-weighted signed order flow).
- Bivariate structural VAR($p$) process:
  $$r_t = \sum_{i=1}^p \alpha_i r_{t-i} + \sum_{i=0}^p \beta_i x_{t-i} + v_{1,t}$$
  $$x_t = \sum_{i=1}^p \gamma_i r_{t-i} + \sum_{i=1}^p \delta_i x_{t-i} + v_{2,t}$$
- **Permanent Price Impact ($R_\infty$)**:
  Cumulative impulse response of midquote returns to a unit trade innovation shock:
  $$R_\infty = \lim_{k \to \infty} \frac{\partial \ln P_{t+k}}{\partial v_{2,t}} = \frac{\sum_{i=0}^p \beta_i}{1 - \sum_{i=1}^p \alpha_i}$$
- **Hasbrouck Information Share ($IS$)**:
  Ratio of variance of random walk innovation driven by trade shocks to total midquote revision variance:
  $$IS = \frac{\text{Var}(R_\infty \cdot v_{2,t})}{\sigma_w^2} \in [0, 1]$$

---

## 4. Deep Modularization Architecture (< 75 LOC/file)

1. **`src/tree/alpha/observability/attribution-telemetry.ts`** (135 $\rightarrow$ 62 LOC):
   - Extract `computeDistributionStats` to `attribution-telemetry-stats.ts` (32 LOC).
   - Extract `processTelemetryRecord` and `ProviderAccumulator` to `attribution-telemetry-processor.ts` (58 LOC).
   - Keep lean aggregation pipeline in `attribution-telemetry.ts` (62 LOC) with 100% backward compatibility.

2. **`src/tree/alpha/data-quality/validator.ts`** (134 $\rightarrow$ 60 LOC):
   - Extract `RUNNERS` definition table to `validator-runners.ts` (68 LOC).
   - Keep lean facade `validateCandleQuality` in `validator.ts` (60 LOC) orchestrating the dimensional checks.

---

## 5. Implementation Roadmap & Quality Gate

1. **Phase 1: Pillar 1 Garman-Klass Engine**:
   - `src/tree/quantlib/volatility/garman-klass-volatility-types.ts` ($\le 30$ LOC)
   - `src/tree/quantlib/volatility/garman-klass-volatility-engine.ts` ($\le 75$ LOC)
   - Unit tests: `test/quant/garman-klass-volatility-engine.test.ts`
2. **Phase 2: Pillar 2 Hasbrouck VAR Engine**:
   - `src/tree/quantlib/microstructure/hasbrouck-var-types.ts` ($\le 30$ LOC)
   - `src/tree/quantlib/microstructure/hasbrouck-var-engine.ts` ($\le 75$ LOC)
   - Unit tests: `test/quant/hasbrouck-var-engine.test.ts`
3. **Phase 3: Deep Modularization**:
   - Refactor `attribution-telemetry.ts` and `validator.ts` into clean submodules under 75 LOC.
   - Verify existing test suites (`src/tree/alpha/observability/` & `src/tree/alpha/data-quality/`).
4. **Phase 4: Multi-Domain E2E Simulation & Quality Gate**:
   - `test/quant/v20-apex-suite-simulation.test.ts` connecting Garman-Klass volatility regime $\rightarrow$ Hasbrouck trade flow analysis $\rightarrow$ data-quality & telemetry validation.
   - Run full test suite (`npm test`), verify 0 `:any`, 0 ESLint warnings, 100% green.
