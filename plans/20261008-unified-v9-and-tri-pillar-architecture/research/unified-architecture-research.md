# Research: Unified v9 Quantitative Architecture & Operations Triad

## 1. Operational & Research Integration
- **Deliberation Bridge**: `TradingAgents` generates hypothesis candidates via multi-agent debate (`compileDebateHypotheses`). Connecting this to `AlphaResearchPipeline` and `runSurvivalGate` closes the autonomous research loop (`PAPER_CANDIDATE` vs `KILLED`).
- **Terminal HUD**: Operators require real-time emergency controls (`Emergency Pause All`, `Resume All`, circuit breaker status) and visual insight into live deliberation hypotheses.
- **Edge D1 Telemetry**: `BotManagerCacheState` handles high-frequency scheduler reads; tracking hit/miss ratios, TTL evictions, and anti-IDOR rejections guarantees transparent edge runtime health.

## 2. Microstructure Market Making & Order Flow Imbalance (OFI)
- **Guéant-Tapia-Manziadi (2012)**: Solves the Hamilton-Jacobi-Bellman (HJB) system for optimal bid/ask spreads:
  $$\delta^b(q) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) + \frac{2q + 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}}$$
  Provides closed-form, deterministic quotes with inventory risk aversion $\gamma$ and order intensity parameters $(A, \kappa)$.
- **Order Flow Imbalance (OFI)**: Cont, Kukanov & Stoikov (2014) multiscale OFI measures net order flow shifts across top-N book levels:
  $$OFI_t = \sum_{k=1}^K \left[ I_{\{p_{b,k,t} \ge p_{b,k,t-1}\}} v_{b,k,t} - I_{\{p_{b,k,t} \le p_{b,k,t-1}\}} v_{b,k,t-1} - (I_{\{p_{a,k,t} \le p_{a,k,t-1}\}} v_{a,k,t} - I_{\{p_{a,k,t} \ge p_{a,k,t-1}\}} v_{a,k,t-1}) \right]$$
- **Funding Rate Carry**: Exploits 8-hour perpetual swap funding rate differentials while hedging delta via spot or counter-perp.

## 3. Multivariate Cointegration & Internal Crossing Network
- **Johansen Cointegration**: Maximum likelihood estimation on VAR models identifying $r$ stationary cointegrating vectors $\beta$:
  $$\Delta X_t = \Pi X_{t-1} + \sum_{i=1}^{p-1} \Gamma_i \Delta X_{t-i} + \varepsilon_t, \quad \Pi = \alpha \beta'$$
  Evaluates Trace and Max-Eigenvalue statistics with critical value tables.
- **Internal Crossing Network**: Matches offsetting bot orders internally before routing to external exchanges, capturing the full bid-ask spread and reducing taker fees to zero.

## 4. Key Constraints & Non-Negotiables
- Pure TypeScript, edge-compatible (WebCrypto, zero node:crypto), zero external ML dependencies.
- Files strictly $\le 130$ LOC (ceiling 200 LOC), zero `:any`, zero `console.log`.
- 100% test coverage on all mathematical and financial modules.
- Strict ADR-001 paper-only invariant (zero real orders, zero live capital).
