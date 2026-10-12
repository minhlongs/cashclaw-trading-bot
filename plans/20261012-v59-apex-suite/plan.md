---
status: pending
suite: Triad v59 Golden Apex Multi-Domain Quantitative & Architecture Suite
date: 2026-10-12
targets:
  - Gatheral (2010) No-Dynamic-Arbitrage Decay
  - Roll (1984) Implicit Bid-Ask Spread Serial Covariance
  - Kyle & Obizhaeva (2016) Microstructure Invariance
  - Biais, Hillion & Spatt (1995) LOB Dynamics & Liquidity Provision
  - Rate Limiter modularization (<= 36 LOC)
  - Portfolio Advisor modularization (<= 36 LOC)
---

# Plan: Triad v59 Golden Apex Multi-Domain Quantitative & Architecture Suite

## Context & Objectives
Following the completion, verification, and commit of Triad v58 Golden Apex Suite (`026d025`, 5,850/5,850 passing tests across 622 test files, zero `:any` types, zero ESLint warnings, all source files strictly $\le 36$ LOC), this plan delivers the **Triad v59 Golden Apex Multi-Domain Quantitative & Architecture Suite**:
1. Implement **Gatheral (2010) No-Dynamic-Arbitrage Principle & Transient Impact Decay Engine** in `src/tree/quantlib/execution/`.
2. Implement **Roll (1984) Implicit Bid-Ask Spread Serial Covariance Estimator** in `src/tree/quantlib/microstructure/`.
3. Implement **Kyle & Obizhaeva (2016) Market Microstructure Invariance Engine** in `src/tree/quantlib/microstructure/`.
4. Implement **Biais, Hillion & Spatt (1995) Empirical Order Book Dynamics & Liquidity Provision Engine** in `src/tree/quantlib/microstructure/`.
5. Modularize high line-count production monoliths strictly $\le 36$ LOC per file:
   - `src/tree/exchange/rate-limiter/rate-limiter.ts` (116 LOC $\to \le 36$ LOC facade).
   - `src/forest/research/tradingagents/portfolio-advisor.ts` (116 LOC $\to \le 36$ LOC facade).
6. Provide comprehensive test suites, simulation verification, update documentation and persistent memory.

---

## Technical Specifications & Architecture

### Pillar 1: Gatheral (2010) No-Dynamic-Arbitrage Decay Engine
- **Files**:
  - `src/tree/quantlib/execution/gatheral-arbitrage-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/execution/gatheral-arbitrage-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Jim Gatheral (2010), *"No-Dynamic-Arbitrage and Market Impact"*, Quantitative Finance, 10(7), 749–759.
- **Mathematical Specification**:
  - Power-law / exponential transient impact decay:
    $$\gamma(t) = \frac{\gamma_0}{(1 + t / \tau)^\alpha}$$
  - No-dynamic-arbitrage condition: Kernel must be positive definite, non-increasing, and convex ($\alpha \ge 1.0$ for power law, or $\rho > 0$ for exponential) to prevent round-trip price manipulation / machine money pump:
    $$\mathcal{C}_{\text{round-trip}} = \int_0^T \dot{x}_t \left( \int_0^t \gamma(t-s) \dot{x}_s \, ds \right) dt \ge 0$$

### Pillar 2: Roll (1984) Implicit Spread Serial Covariance Estimator
- **Files**:
  - `src/tree/quantlib/microstructure/roll-implicit-spread-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/roll-implicit-spread-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Richard Roll (1984), *"A Simple Implicit Measure of the Effective Bid-Ask Spread in an Efficient Market"*, Journal of Finance, 39(4), 1127–1139.
- **Mathematical Specification**:
  - Serial covariance of price changes:
    $$\text{Cov}(\Delta P_t, \Delta P_{t-1}) = -\frac{S^2}{4}$$
  - Roll effective spread:
    $$S_{\text{Roll}} = 2 \sqrt{\max\left(0, -\text{Cov}(\Delta P_t, \Delta P_{t-1})\right)}$$
  - Percentage effective spread $s = S_{\text{Roll}} / \bar{P}$ and liquidity classification.

### Pillar 3: Kyle & Obizhaeva (2016) Market Microstructure Invariance Engine
- **Files**:
  - `src/tree/quantlib/microstructure/kyle-obizhaeva-invariance-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/kyle-obizhaeva-invariance-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Albert S. Kyle and Anna A. Obizhaeva (2016), *"Market Microstructure Invariance: Empirical Hypotheses"*, Econometrica, 84(4), 1345–1404.
- **Mathematical Specification**:
  - Business time and invariant transaction size:
    $$W = \left(\frac{P \cdot \text{ADV} \cdot \sigma}{C_{\text{scale}}}\right)^{2/3}, \quad Q = \left(\frac{P \cdot \text{ADV} / \sigma}{C_{\text{scale}}}\right)^{1/3}$$
  - Invariant price impact parameter $\bar{\lambda}_{\text{inv}}$ and expected trade frequency per business unit.

### Pillar 4: Biais, Hillion & Spatt (1995) LOB Dynamics Engine
- **Files**:
  - `src/tree/quantlib/microstructure/biais-lob-dynamics-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/biais-lob-dynamics-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Bruno Biais, Pierre Hillion, Chester Spatt (1995), *"An Empirical Analysis of the Limit Order Book and the Order Flow in the Paris Bourse"*, Journal of Finance, 50(5), 1655–1689.
- **Mathematical Specification**:
  - Event transition probabilities across book depth states: cancellations, market orders, limit order submissions inside the spread vs at best quotes.
  - Generates conditional transition matrix $T_{ij} = P(\text{Event}_{t} = j \mid \text{Event}_{t-1} = i)$, diagonal concentration score, and order flow clustering intensity.

### Pillar 5: Deep Production Architecture Modularization ($\le 36$ LOC)
1. **`src/tree/exchange/rate-limiter/rate-limiter.ts` (116 LOC $\to \le 36$ LOC facade)**:
   - Extract token bucket algorithm into `src/tree/exchange/rate-limiter/rate-limiter-bucket.ts` ($\le 36$ LOC).
   - Extract sliding window rate limiter into `src/tree/exchange/rate-limiter/rate-limiter-window.ts` ($\le 36$ LOC).
   - Retain facade delegating to submodules with 100% backward compatibility.
2. **`src/forest/research/tradingagents/portfolio-advisor.ts` (116 LOC $\to \le 36$ LOC facade)**:
   - Extract weight normalization & clipping into `src/forest/research/tradingagents/portfolio-weight-normalizer.ts` ($\le 36$ LOC).
   - Extract risk scenario stress calculation into `src/forest/research/tradingagents/portfolio-stress-evaluator.ts` ($\le 36$ LOC).
   - Retain facade with 100% backward compatibility.

---

## Verification & Testing Gate
1. **Unit & Property Tests**:
   - `test/quant/gatheral-arbitrage.test.ts`
   - `test/quant/roll-implicit-spread.test.ts`
   - `test/quant/kyle-obizhaeva-invariance.test.ts`
   - `test/quant/biais-lob-dynamics.test.ts`
2. **E2E Cross-Domain Simulation**:
   - `test/quant/v59-apex-suite-simulation.test.ts`
3. **Regression Tests**:
   - Existing rate-limiter and portfolio-advisor test suites 100% green.
4. **Quality Gates**:
   - `npm run type-check` $\to 0$ errors, $0$ `:any`.
   - `npm run lint` $\to 0$ warnings.
   - `npm test` $\to 100\%$ green.
   - All source files $\le 36$ LOC.
5. **Documentation & Memory**:
   - Update `docs/project-changelog.md` and `docs/development-roadmap.md`.
   - Record memory file in `~/.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`.
