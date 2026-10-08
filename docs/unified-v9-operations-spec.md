# Specification: Unified v9 Quantitative Architecture & Operations Triad

## 1. Executive Summary
This document specifies the architecture for combining:
1. **Operational Research & Control Triad**: TradingAgents hypothesis-to-pipeline bridge, Terminal Quick Actions HUD, and D1 cache telemetry.
2. **Microstructure Market Making & OFI Desk**: Closed-form Guéant-Tapia-Manziadi (2012) quoting engine with Order Flow Imbalance (OFI) alpha.
3. **Multivariate Cointegration & Internal Crossing Network**: Johansen cointegration vector estimator and zero-fee internal order matching network.

## 2. Component Specifications

### 2.1 Deliberation & Survival Bridge
- **Ingress**: `DebateState` and compiled `ExperimentSpec[]` from `debateToHypothesis`.
- **Egress**: Evaluated `SurvivalGateResult` reflecting out-of-sample sharpe, drawdown, and statistical significance.
- **Feedback**: Updates hypothesis lifecycle from `PROPOSED` to `PAPER_CANDIDATE` or `KILLED`.

### 2.2 Guéant-Tapia-Manziadi Market Making
- **Mathematical Kernel**:
  $$\delta^b(q) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) + \frac{2q + 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}}$$
  $$\delta^a(q) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) - \frac{2q - 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}}$$
- **Order Flow Imbalance (OFI)**: Skews reservation price $R(t) = S(t) + \beta \cdot OFI_t$ before applying $\delta^a, \delta^b$.

### 2.3 Multivariate Johansen Cointegration
- Evaluates $r$-rank cointegration via characteristic polynomial eigenvalues of canonical correlation matrix:
  $$\lambda_i = \text{eig}\left( S_{11}^{-1} S_{10} S_{00}^{-1} S_{01} \right)$$
- Emits cointegration vector $\beta$, half-life $\tau_{half}$, and Ornstein-Uhlenbeck z-score spread.

### 2.4 Internal Crossing Network
- Gathers pending orders across bot fleet within discrete matching batch (e.g., 50ms window).
- Matches opposing BUY and SELL orders at current mid-price, emitting internal execution fills and residual uncrossed orders.

## 3. Invariants & Quality Standards
- Edge runtime native (WebCrypto, pure Math functions).
- All source files $\le 130$ LOC (hard max 200 LOC).
- Zero `:any` types, zero `console.log`.
- 100% test coverage across all quantitative modules.
