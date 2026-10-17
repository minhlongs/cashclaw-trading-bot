---
title: "Triad v61 Golden Apex Multi-Domain Quantitative & Architecture Suite"
date: "2026-10-12"
status: "pending"
priority: "P0"
suite: "v61"
---

# Plan: Triad v61 Golden Apex Multi-Domain Quantitative & Architecture Suite

## Context
Following the successful completion, testing, and commit of Triad v60 Golden Apex Suite (`524ce79`, 5,879/5,879 passing tests across 632 test files, zero `:any` types, zero ESLint warnings, all source files strictly $\le 35$ LOC), the user commanded `/bootstrap:auto:parallel go next refactor to /brainstorming --deep` and chose Option 1 ("cà 3" - Full Synthesis) with a formal implementation plan.

The goal of **Triad v61 Golden Apex Multi-Domain Quantitative & Architecture Suite** is:
1. Implement **Rogers & Satchell (1991) Non-Zero Drift OHLC Volatility Engine** in `src/tree/quantlib/volatility/`.
2. Implement **Barndorff-Nielsen & Shephard (2004, 2006) Bipower Variation Jump Detection Engine** in `src/tree/quantlib/volatility/`.
3. Implement **Cont & de Larrard (2013) Markovian LOB First-Passage Queue Depletion Engine** in `src/tree/quantlib/microstructure/`.
4. Implement **Chordia, Subrahmanyam & Anshuman (2001) Trading Activity & Liquidity Volatility Engine** in `src/tree/quantlib/microstructure/`.
5. Eliminate technical debt in high line-count production files by decomposing:
   - `src/tree/exchange/ccxt/client.ts` (115 LOC $\to \le 35$ LOC facade)
   - `src/tree/alpha/signals/funding-api.ts` (115 LOC $\to \le 35$ LOC facade)
   Guaranteeing 100% backward compatibility and 0 breaking changes across all orchestrators, bots, and pipeline consumers.
6. Enforce rigorous testing, zero regressions, zero `:any`, zero ESLint warnings, all source files $\le 36$ LOC, and update documentation and persistent memory.

---

## Technical Specifications & Architecture

### Pillar 1: Rogers & Satchell (1991) Non-Zero Drift OHLC Volatility Engine
- **Files**:
  - `src/tree/quantlib/volatility/rogers-satchell-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/volatility/rogers-satchell-estimator.ts` ($\le 36$ LOC)
  - `src/tree/quantlib/volatility/rogers-satchell-engine.ts` ($\le 20$ LOC)
- **Academic Foundation**:
  - L.C.G. Rogers and S.E. Satchell (1991), *"Estimating Variance from High, Low, Open, and Close Prices"*, Annals of Applied Probability, 1(4), 504–512.
- **Mathematical Specification**:
  - Unbiased estimator for continuous Brownian diffusion with non-zero drift $\mu$:
    $$u_i = \ln(H_i / O_i), \quad d_i = \ln(L_i / O_i), \quad c_i = \ln(C_i / O_i)$$
    $$\sigma^2_{\text{RS}} = \frac{1}{N} \sum_{i=1}^N \left[ u_i(u_i - c_i) + d_i(d_i - c_i) \right]$$
  - Unbiased under any drift rate $\mu$, unlike Parkinson and Garman-Klass which overestimate variance during trending regimes.

### Pillar 2: Barndorff-Nielsen & Shephard (2004, 2006) Bipower Variation Jump Detection Engine
- **Files**:
  - `src/tree/quantlib/volatility/bipower-jump-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/volatility/bipower-jump-estimator.ts` ($\le 36$ LOC)
  - `src/tree/quantlib/volatility/bipower-jump-engine.ts` ($\le 20$ LOC)
- **Academic Foundation**:
  - O.E. Barndorff-Nielsen and N. Shephard (2004, 2006), *"Econometric analysis of realized covariation: High frequency based covariance, beta and correlation in financial economics"*, Econometrica.
- **Mathematical Specification**:
  - Realized Variance: $RV = \sum_{i=1}^N r_i^2$
  - Bipower Variation: $BV = \mu_1^{-2} \sum_{i=2}^N |r_i| |r_{i-1}|$, where $\mu_1 = \sqrt{2/\pi} \approx 0.79788456$.
  - Jump Variation component: $J = \max(0, RV - BV)$.
  - Relative Jump Ratio: $R_J = \frac{J}{RV}$.
  - Jump test statistic Z-score for discontinuous price process jumps.

### Pillar 3: Cont & de Larrard (2013) Markovian LOB Queue Depletion Engine
- **Files**:
  - `src/tree/quantlib/microstructure/cont-delarrard-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/cont-delarrard-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Rama Cont and Adrien de Larrard (2013), *"Price Dynamics in a Markovian Limit Order Book"*, SIAM Journal on Financial Mathematics, 4(1), 1–25.
- **Mathematical Specification**:
  - First-passage time of queue depletion in bid/ask limit order queues:
    $$P_{\text{up}}(q_b, q_a) = \frac{q_b}{q_b + q_a}$$
  - Asymmetric flow drift $\nu = \theta + \mu - \lambda$:
    $$P_{\text{up}} = \frac{1 - e^{-2\nu q_b / \sigma^2}}{1 - e^{-2\nu (q_b + q_a) / \sigma^2}}$$
  - Expected time to next price move: $\mathbb{E}[\tau] = \frac{q_b q_a}{D_{\text{eff}}}$.

### Pillar 4: Chordia, Subrahmanyam & Anshuman (2001) Trading Activity Engine
- **Files**:
  - `src/tree/quantlib/microstructure/chordia-trading-activity-types.ts` ($\le 28$ LOC)
  - `src/tree/quantlib/microstructure/chordia-trading-activity-engine.ts` ($\le 36$ LOC)
- **Academic Foundation**:
  - Tarun Chordia, Avanidhar Subrahmanyam, and V. Ravi Anshuman (2001), *"Trading Activity and Expected Stock Returns"*, Journal of Financial Economics, 59(1), 3–32.
- **Mathematical Specification**:
  - Disentangles trading volume level (turnover) from trading volume volatility ($\sigma_{\text{turnover}}$).
  - Calculates turnover ratio, coefficient of variation, and liquidity risk discount.

### Pillar 5: Deep Production Architecture Modularization (< 36 LOC per file)
1. **`src/tree/exchange/ccxt/client.ts` (115 LOC $\to \le 35$ LOC facade)**:
   - Extract exchange class resolution into `src/tree/exchange/ccxt/client-factory.ts` ($\le 32$ LOC).
   - Facade class `CCXTTransformer` delegates mapping and instances cleanly.
2. **`src/tree/alpha/signals/funding-api.ts` (115 LOC $\to \le 35$ LOC facade)**:
   - Extract HTTP fetch & query builder into `src/tree/alpha/signals/funding-fetcher.ts` ($\le 28$ LOC).
   - Extract derivative endpoints (OI, liquidations) into `src/tree/alpha/signals/funding-derivatives.ts` ($\le 35$ LOC).
   - Facade re-exports all endpoints maintaining identical function signatures.

---

## Verification & Testing Gate
1. **Unit Tests**:
   - `test/quant/rogers-satchell-volatility.test.ts`
   - `test/quant/bipower-jump.test.ts`
   - `test/quant/cont-delarrard.test.ts`
   - `test/quant/chordia-trading-activity.test.ts`
2. **E2E Simulation**:
   - `test/quant/v61-apex-suite-simulation.test.ts`: cross-domain multi-venue simulation verifying Rogers-Satchell drift immunity, Bipower jump detection, Cont-de Larrard first-passage probability, and Chordia liquidity volatility.
3. **Regression Tests**:
   - CCXT client tests: 100% green.
   - Funding API tests: 100% green.
4. **Quality Gates**:
   - `npm run type-check` $\to 0$ errors, $0$ `:any`.
   - `npm run lint` $\to 0$ warnings.
   - `npm test` $\to 100\%$ green across all test files.
   - Every source file $\le 36$ LOC.
5. **Documentation & Memory**:
   - Update `docs/project-changelog.md` and `docs/development-roadmap.md`.
   - Record memory file in `~/.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`.
