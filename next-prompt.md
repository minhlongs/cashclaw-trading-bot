---
page: leadlag-hayashi-yoshida
---

**DESIGN SYSTEM (REQUIRED):**
**DESIGN SYSTEM (CashClaw Quant OS):**
- Platform: Desktop Web Application (1440px max container, 240px left sidebar)
- Theme: Dark Mode First (Institutional Quantitative Terminal aesthetic)
- Background: Deep Obsidian Abyss (#0B0E11) with Slate Carbon Cards (#141820) and Elevated Midnight Panels (#1A2030)
- Primary Accent: Quant Emerald Teal (#00D4AA) for primary CTAs, active states, and positive PnL
- Semantic Accents: Crimson Signal Alert (#FF4757) for drawdown/loss, Amber Caution (#FFB020) for PAPER_ONLY safety badges, Deliberation Violet (#A78BFA) for AI agent reasoning
- Borders: Hairline 1px solid #1E2530 on cards, #2A3340 on inputs
- Typography: Geist Sans for UI headers/labels (14px body, 20px section titles, 600 weight) + JetBrains Mono for all numerical telemetry, prices, IC/IR ratios, and SHA-256 checksums
- Geometry: 12px rounded cards, 8px rounded buttons/inputs, 44px minimum interactive height, compact data-dense spacing (16px grid gaps)

**Page request:**
Design the **Continuous-Time Asynchronous Lead-Lag Cross-Covariance & Epps-Free Arbitrage Matrix** (`leadlag-hayashi-yoshida.html`) for CashClaw OS (`src/forest/microstructure/` & `src/forest/relative-value/` Asynchronous Tick Cross-Covariance & Lead-Lag Discovery Engine).
Include:
1. Left sidebar (`240px`) with active state on "Hayashi-Yoshida Lead-Lag" and wired links to all 18 CashClaw OS screens (`index.html`, `alpha-zoo.html`, `deliberation-theater.html`, `strategies/volatility-dca.html`, `correlation-matrix.html`, `execution-ledger.html`, `data-quality-gate.html`, `microstructure-liquidity.html`, `survival-gate.html`, `sovereign-enclave.html`, `relative-value-basis.html`, `billing.html`, `regime-attribution.html`, `fdr-multiple-testing-gate.html`, `style-guide.html`, `portfolio-cvar-stress.html`, `orderbook-imbalance-lob.html`, `rough-volatility-hurst.html`).
2. Top header with `Hayashi-Yoshida (2005) Overlap-Interval Estimator • Epps-Effect Neutralized Cross-Correlation • PAPER_ONLY • ADR-001` badge and `Re-Compute Lead-Lag Curve` button.
3. 3 Telemetry KPI Cards:
   - Dominant Leader-Lagger Pair: `BTC-PERP → SOL-USDT (τ* = +340ms)` (`Peak HY Cross-Correlation ρ_HY(τ*) = +0.742`)
   - Epps Bias Attenuation Recovered: `+0.284 Δρ vs Synchronous 1s Grid` (`Zero Interpolation Lookahead • Poisson Tick Arrivals`)
   - Lead-Lag Signal Ratio (LLR): `2.84 (SIGNIFICANT_LEADER)` (`Causal Cross-Asset Propagation Hurdle Passed`)
4. Asynchronous Pairwise Lead-Lag & Hayashi-Yoshida Cross-Correlation Matrix comparing Synchronous Correlation ($\rho_{\text{sync}}$), Hayashi-Yoshida Correlation ($\rho_{\text{HY}}$), Optimal Lag ($\tau^*$), Lead-Lag Ratio ($\text{LLR}$), Information Share (%), and Paper Execution Action (`PROPAGATION_ARB`, `PASSIVE_SHADOW`, `NO_LEAD_LAG`).
5. Interactive Cross-Correlation Asymmetric Lag Curve ($\rho_{\text{HY}}(\tau)$ for $\tau \in [-2000\text{ms}, +2000\text{ms}]$) & Overlap-Interval Indicator $\mathbb{I}(I_i \cap J_j \neq \emptyset)$ Inspector.
