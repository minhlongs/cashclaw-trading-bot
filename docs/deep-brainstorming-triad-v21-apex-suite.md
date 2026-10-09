# Deep Brainstorming: Triad v21 Apex Quantitative & Architecture Suite

## 1. Problem Statement & Requirements
- **Quantitative Gaps**:
  - Need closed-form optimal limit order quotes balancing adverse selection and inventory risk under inventory-penalized utility (Avellaneda-Stoikov 2008).
  - Need empirical information asymmetry toxicity gate estimating Probability of Informed Trading (EKOP 1996 PIN) from signed buy/sell flow arrivals.
- **Codebase Governance**:
  - `src/tree/alpha/labeling.ts` (129 LOC) and `src/forest/alpha/gate/financial-checks.ts` (136 LOC) exceed the target modularity ceiling (< 75 LOC).
  - Need extraction into atomic submodules ($\le 65$ LOC) while retaining 100% backward compatibility of exports and types.
- **Invariants**:
  - Strict Paper-Trading invariant: zero live orders, realistic fee/slippage modeling.
  - Zero `:any` types, zero ESLint warnings, 100% pass rate across all 5,553+ tests.

## 2. Evaluated Approaches & Trade-Offs

### Approach A: Standalone Quant Engines Only
- **Pros**: Minimal touching of existing production pipeline.
- **Cons**: Leaves technical debt in `labeling.ts` and `financial-checks.ts`.

### Approach B: Architecture Modularization Only
- **Pros**: Reduces LOC in fat files quickly.
- **Cons**: Misses opportunity to deliver institutional micro-price quoting and toxicity defenses.

### Approach C: Full Triad v21 Apex Suite (Recommended)
- **Pros**: Synergistic union of quantitative edge (Avellaneda-Stoikov + EKOP PIN) and clean codebase architecture (< 70 LOC per file). Complete E2E integration test proving algorithmic soundness.
- **Cons**: Requires rigorous mathematical verification and cross-domain simulation testing.

## 3. Recommended Solution & Mathematical Formulations

### Pillar 1: Avellaneda-Stoikov (2008) High-Frequency Quoting Engine
- **Files**:
  - `src/tree/quantlib/marketmaking/avellaneda-stoikov-types.ts` ($\le 25$ LOC)
  - `src/tree/quantlib/marketmaking/avellaneda-stoikov-engine.ts` ($\le 70$ LOC)
- **Formulation**:
  - Reservation price: $r(s, q, t) = s - q \gamma \sigma^2 (T - t)$
  - Half-spread: $\delta^a + \delta^b = \gamma \sigma^2 (T - t) + \frac{2}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right)$
  - Optimal bid/ask quotes: $r_b = r - \delta^b$, $r_a = r + \delta^a$.

### Pillar 2: Easley-Kiefer-O'Hara-Paperman (EKOP 1996) PIN Engine
- **Files**:
  - `src/tree/quantlib/microstructure/ekop-pin-types.ts` ($\le 25$ LOC)
  - `src/tree/quantlib/microstructure/ekop-pin-engine.ts` ($\le 70$ LOC)
- **Formulation**:
  - Uninformed baseline arrival: $\epsilon = \min(\bar{B}, \bar{S})$
  - Informed arrival: $\mu = |\bar{B} - \bar{S}|$
  - Event probability: $\alpha \in [0, 1]$
  - Probability of Informed Trading: $\text{PIN} = \frac{\alpha \mu}{\alpha \mu + 2\epsilon}$

### Pillar 3: Deep File Modularization (< 70 LOC)
- `src/tree/alpha/labeling.ts` (129 LOC) $\rightarrow$ `labeling-barrier-evaluator.ts` ($\le 60$ LOC) + `labeling.ts` ($\le 60$ LOC).
- `src/forest/alpha/gate/financial-checks.ts` (136 LOC) $\rightarrow$ `financial-checks-core.ts` ($\le 60$ LOC) + `financial-checks.ts` ($\le 60$ LOC).

## 4. Implementation Considerations & Risks
- **Numerical Stability**: Safeguard logs and divisions by zero in PIN and Avellaneda equations using strictly bounded epsilons ($10^{-8}$).
- **API Parity**: Ensure every existing caller and test for `labelEvent` and `financial-checks` continues to compile without modifications.

## 5. Success Metrics
- 100% test green (5,553+ passing).
- Zero TypeScript `:any` annotations, zero ESLint warnings.
- Strict LOC ceiling $\le 70$ LOC on all new and refactored files.
