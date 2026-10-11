# Triad v56 Apex Multi-Domain Quantitative & Architecture Suite Brainstorm Report

**Date:** 2026-10-12  
**Status:** Agreed & Validated (Synthesize All / Option 3)  
**Target:** Triad v56 Golden Apex Suite

---

## 1. Problem Statement & Objectives

Following the deployment of Triad v55 (Lehalle volume curve, Kyle Cournot, Foucault winner's curse, Amihud-Mendelson clientele, paper exchange & backtest actions modularization < 36 LOC, 5,825/5,825 tests passing), the objective for Triad v56 is twofold:
1. **Pioneer Deep Quantitative Market Microstructure & Execution Frontiers**:
   - Establish non-manipulability and quasi-arbitrage conditions on transient impact kernels (Huberman & Stanzl, 2004).
   - Decompose transaction price changes into structural adverse selection innovations, order surprises, and inventory frictions (Madhavan, Richardson & Roomans, 1997).
   - Characterize aggregate order imbalance dynamics, spread expansion, and volatility transmission (Chordia, Roll & Subrahmanyam, 2005).
   - Formulate structural Probability of Informed Trading (PIN) from uncoordinated buy/sell arrival rates (Easley, Kiefer, O'Hara & Paperman, 1996).
2. **Eliminate Remaining Production Monoliths (< 36 LOC per file)**:
   - Decompose `src/forest/api/handlers/daily-stats.ts` (116 LOC $\to \le 35$ LOC facade) into isolated D1 query and aggregation modules.
   - Decompose `src/tree/exchange/live/index.ts` (118 LOC $\to \le 35$ LOC facade) into live market data helpers and concise exchange facade.

---

## 2. Quantitative Specifications

### Pillar 1: Huberman & Stanzl (2004) Price Manipulation & Non-Arbitrage Engine
- **Academic Foundation**: Gur Huberman and Werner Stanzl (2004), *Mathematical Finance*, 14(3), 369–392.
- **Location**: `src/tree/quantlib/execution/huberman-stanzl-types.ts` & `huberman-stanzl-engine.ts`.
- **Formulation**:
  - In a market without price manipulation, the permanent price impact function must be linear:
    $$I(q) = \lambda q, \quad \lambda > 0$$
  - Total price impact with transient decay factor $\rho \in [0, 1]$:
    $$\Delta P_t = \lambda q_t + \theta \sum_{s < t} \rho^{t-s} q_s$$
  - Round-trip round manipulation cost (must be strictly positive for non-arbitrage):
    $$\mathcal{C}_{\text{round-trip}} = \frac{1}{2} \lambda q^2 + (1 - \rho) \theta q^2 > 0$$

### Pillar 2: Madhavan-Richardson-Roomans (1997) Structural Order Flow Engine
- **Academic Foundation**: Ananthanarayanan Madhavan, David Richardson, and Mark Roomans (1997), *Review of Financial Studies*, 10(4), 1035–1064.
- **Location**: `src/tree/quantlib/microstructure/mrr-structural-types.ts` & `mrr-structural-engine.ts`.
- **Formulation**:
  - Transaction price change regression:
    $$\Delta p_t = (\phi + \theta) x_t - (\phi + \rho \theta) x_{t-1} + \epsilon_t$$
    where $x_t \in \{-1, +1\}$ is trade direction, $\theta$ is adverse selection parameter, $\phi$ is order processing cost / half-spread, and $\rho$ is serial autocorrelation of order flow.
  - Effective spread: $S = 2(\phi + \theta)$.
  - Adverse selection fraction: $\alpha_{\text{adverse}} = \frac{\theta}{\phi + \theta}$.

### Pillar 3: Chordia-Roll-Subrahmanyam (2005) Order Imbalance Dynamics Engine
- **Academic Foundation**: Tarun Chordia, Richard Roll, and Avanidhar Subrahmanyam (2005), *Journal of Financial Economics*, 76(2), 271–300.
- **Location**: `src/tree/quantlib/microstructure/chordia-imbalance-types.ts` & `chordia-imbalance-engine.ts`.
- **Formulation**:
  - Order imbalance metrics:
    $$OIB_{\text{shares}} = B_t - S_t, \quad OIB_{\text{ratio}} = \frac{B_t - S_t}{B_t + S_t}$$
  - Impact on spread expansion and reversal:
    $$\Delta \text{Spread}_t = \gamma_0 + \gamma_1 |OIB_t| + \gamma_2 \sigma_t$$
    $$\text{Expected Reversal} = -\beta_{OIB} \cdot OIB_t$$

### Pillar 4: Easley-Kiefer-O'Hara-Paperman (1996) EKOP PIN Engine
- **Academic Foundation**: David Easley, Nicholas M. Kiefer, Maureen O'Hara, and Joseph B. Paperman (1996), *Journal of Finance*, 51(4), 1405–1436.
- **Location**: `src/tree/quantlib/microstructure/ekop-pin-types.ts` & `ekop-pin-engine.ts`.
- **Formulation**:
  - Arrival rates: informed arrival $\mu$, uninformed buy rate $\epsilon$, uninformed sell rate $\epsilon$, event probability $\alpha$, bad news probability $\delta$.
  - Probability of Informed Trading:
    $$PIN = \frac{\alpha \mu}{\alpha \mu + 2 \epsilon}$$
  - Expected total daily order volume: $\mathbb{E}[V] = \alpha \mu + 2 \epsilon$.

---

## 3. Structural Modularization Targets (< 36 LOC)

1. **`src/forest/api/handlers/daily-stats.ts` (116 LOC $\to \le 35$ LOC facade)**:
   - Extract `daily-stats-query.ts` ($\le 35$ LOC): queries `capital_snapshots` and `trade_events` from D1.
   - Extract `daily-stats-aggregate.ts` ($\le 35$ LOC): computes PnL, win rate, and strategy breakdown.
   - Facade delegating cleanly with complete error handling.
2. **`src/tree/exchange/live/index.ts` (118 LOC $\to \le 35$ LOC facade)**:
   - Extract `live-market-data.ts` ($\le 35$ LOC): ticker, order book, balance, and order fetching routines.
   - Maintain full `ExchangeAdapter` contract and zero regressions in tests.

---

## 4. Validation & Quality Criteria

- 100% strict type safety: 0 `:any` types.
- 0 ESLint warnings (`npm run lint`).
- 0 TypeScript compilation errors (`npm run type-check`).
- 100% test pass rate across all unit and E2E simulation tests.
- Every new and refactored production source file strictly $\le 36$ LOC.
