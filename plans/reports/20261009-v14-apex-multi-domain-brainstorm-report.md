# Brainstorming Report: v14 Apex Multi-Domain Quantitative & Architecture Suite

- **Date**: 2026-10-09
- **Scope**: Synthesis of All 3 Pillars ("cả 3"):
  1. Pillar 1: Gatheral-Schied Transient Market Impact & Alfonsi LOB Depth Resilience (`src/tree/quantlib/microstructure/`)
  2. Pillar 2: Hawkes Self-Exciting Jump Toxicity & Ledoit-Wolf Shrinkage Covariance (`src/tree/quantlib/microstructure/` & `src/tree/quantlib/portfolio/`)
  3. Pillar 3: Structural Modularization of Target Monoliths > 175 LOC (`robustness-checks.ts`, `agent.ts`, `telemetry-diagnostics.ts`)
- **Safety Invariant**: Strict preservation of ADR-001 paper-only invariant (0 real capital risk, pure WebCrypto/TypeScript, 0 `:any` types).

---

## 1. Mathematical Foundations & Formulations

### 1.1 Gatheral-Schied Transient Market Impact & Alfonsi Book Resilience
- **Transient Market Impact**:
  $$I(t) = \eta \cdot v(t)^\alpha \cdot G(t - s)$$
  Kernel $G(\tau) = e^{-\gamma \tau}$ where $\gamma > 0$ governs the rate of impact decay.
- **Alfonsi LOB Depth Shape Resilience**:
  $$\frac{d D(t)}{dt} = -\kappa (D(t) - D_\infty)$$
  Computes expected resilience time $T_{\text{resilience}} = \frac{1}{\kappa} \ln\left(\frac{D_0 - D_\infty}{\epsilon}\right)$ to prevent adverse pricing feedback on subsequent order slices.

### 1.2 Hawkes Bivariate Self-Exciting Jump Toxicity
- **Intensity Process**:
  $$\lambda(t) = \mu + \sum_{t_i < t} \alpha e^{-\beta (t - t_i)}$$
- **Branching Ratio**:
  $$\eta = \frac{\alpha}{\beta} \in [0, 1)$$
  When $\eta \ge 0.85$, order flow enters an explosive clustering regime (flash toxicity cascade), triggering immediate execution throttling.

### 1.3 Ledoit-Wolf Optimal Shrinkage Covariance Matrix
- Guaranteed non-singular, positive-definite matrix estimator:
  $$\Sigma^* = (1 - \delta^*) S + \delta^* F$$
  where $S$ is sample covariance, $F$ is constant-correlation target, and $\delta^*$ is the asymptotically optimal shrinkage intensity calculated via data moments.

---

## 2. Structural Modularization Map

1. `src/forest/alpha/gate/robustness-checks.ts` (185 LOC)
   - Extract `robustness-checks-invariance.ts` (handling checks 12-15: leakage, window dependency, baseline, hash).
   - Keep checks 9-11 in `robustness-checks.ts` (re-exporting 12-15). File reduced to ~60 LOC.
2. `src/forest/alpha/research-agent/agent.ts` (181 LOC)
   - Extract `agent-validation-matcher.ts` (handling token matching, falsification matching, and JSON unmarshaling).
   - Keep core orchestration in `agent.ts`. File reduced to ~110 LOC.
3. `src/forest/alpha/observability-eval/telemetry-diagnostics.ts` (175 LOC)
   - Extract `telemetry-diagnostics-metrics.ts` (handling percentiles, provider aggregation, and latency statistics).
   - Keep high-level section builders in `telemetry-diagnostics.ts`. File reduced to ~100 LOC.

---

## 3. Execution Roadmap & Verification
- Unit test coverage for all new mathematical engines in `test/quant/`.
- Regression verification across 480 existing test files.
- Zero TypeScript compiler errors (`npx tsc --noEmit`).
