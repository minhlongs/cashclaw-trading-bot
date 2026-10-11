# Plan: Triad v51 Golden Apex Multi-Domain Quantitative & Architecture Suite

## Status: pending
Date: 2026-10-11
Scope: Triad v51 Quantitative Execution, Microstructure & Deep Modularization

## Strategic Pillars

### Pillar 1: Konishi & Browne (2000) Optimal Dynamic VWAP Execution & Tracking Error Minimization
- **Files**:
  - `src/tree/quantlib/execution/konishi-browne-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/execution/konishi-browne-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Atsuo Konishi and Christopher Browne (2000), *"Optimal Execution of a Portfolio of Stocks"*, Journal of Financial and Quantitative Analysis, 35(2), 261–279.
- **Formulation**:
  - Liquidates $Q_0$ shares over $N$ intervals against an expected volume profile $w_k \ge 0, \sum w_k = 1$.
  - Mean-variance tracking error variance minimization under risk aversion $\lambda \ge 0$, volatility $\sigma > 0$:
    $$q_k = Q_0 \cdot \frac{w_k \cdot (1 + \lambda \sigma^2 \tau_k)^{-1}}{\sum_{j=1}^N w_j \cdot (1 + \lambda \sigma^2 \tau_j)^{-1}}$$
    where $\tau_k = (N - k) / N$ is remaining time.
  - Price impact: $P_k = \max(10^{-4}, P_0 - \gamma \sum_{j=1}^k q_j - \eta \cdot (q_k / (w_k + 10^{-6})))$.
  - Tracking error in basis points against benchmark VWAP.

### Pillar 2: Stoll (1989) Three-Component Covariance Spread Decomposition Engine
- **Files**:
  - `src/tree/quantlib/microstructure/stoll-spread-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/stoll-spread-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Hans R. Stoll (1989), *"Inferring the Components of the Bid-Ask Spread: Theory and Empirical Tests"*, The Journal of Finance, 44(1), 115–134.
- **Formulation**:
  - Inputs: trade price sequence $P_t$, quote midpoint sequence $M_t$.
  - Serial covariances: $\text{Cov}(\Delta P_t, \Delta P_{t-1})$, $\text{Cov}(\Delta M_t, \Delta M_{t-1})$, and cross-covariance $\text{Cov}(\Delta M_t, \Delta P_{t-1})$.
  - Implied half-spread $s = \sqrt{\max(10^{-8}, -\text{Cov}(\Delta P_t, \Delta P_{t-1}))}$ or observed half-spread.
  - 3-Way decomposition:
    - Adverse selection fraction: $\alpha = \max(0, \min(1, \frac{\text{Cov}(\Delta M_t, \Delta P_{t-1})}{s^2}))$.
    - Inventory holding fraction: $\gamma = \max(0, \min(1 - \alpha, \frac{-\text{Cov}(\Delta M_t, \Delta M_{t-1})}{s^2}))$.
    - Order processing fraction: $\pi = \max(0, 1 - \alpha - \gamma)$.

### Pillar 3: Structural Deep Modularization (< 36 LOC per file)
1. **`src/tree/research/alpha/compiler.ts` (119 LOC $\rightarrow \le 35$ LOC facade)**:
   - Extract `CompilerContext` to `src/tree/research/alpha/compiler-types.ts` ($\le 25$ LOC).
   - Extract causal validation loop to `src/tree/research/alpha/compiler-causal.ts` ($\le 35$ LOC).
   - Extract validation stages orchestrator to `src/tree/research/alpha/compiler-runner.ts` ($\le 35$ LOC).
   - Keep `src/tree/research/alpha/compiler.ts` ($\le 35$ LOC) as pure facade delegating to submodules with 100% backward compatibility.
2. **`src/tree/regime/classifier.ts` (119 LOC $\rightarrow \le 35$ LOC facade)**:
   - Extract state & cold-start logic to `src/tree/regime/classifier-state.ts` ($\le 25$ LOC).
   - Extract transition gate logic to `src/tree/regime/classifier-transition.ts` ($\le 35$ LOC).
   - Keep `src/tree/regime/classifier.ts` ($\le 35$ LOC) as `RuleBasedRegimeClassifier` delegating to state & transition helpers.

### Pillar 4: Verification Gate & Governance
- Unit tests:
  - `test/quant/konishi-browne.test.ts`
  - `test/quant/stoll-spread.test.ts`
  - `test/quant/v51-apex-suite-simulation.test.ts`
- Verification:
  - `npx tsc --noEmit` (0 errors, 0 `:any`)
  - `npm run lint` (0 warnings)
  - `npm test` (100% green tests)
  - Verify line count $\le 36$ LOC on all new/modified files.
