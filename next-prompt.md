---
page: martingale-optimal-transport
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
Design the **Martingale Optimal Transport & Model-Free Dupire Local Volatility Surface Cockpit** (`martingale-optimal-transport.html`) for CashClaw OS (`src/forest/volatility/` & `src/forest/pricing/` Model-Free Arbitrage Bounds & Dupire PDE Calibration Engine).
Include:
1. Left sidebar (`240px`) with active state on "Martingale Optimal Transport" and wired links to all 22 CashClaw OS screens (`index.html`, `alpha-zoo.html`, `deliberation-theater.html`, `strategies/volatility-dca.html`, `correlation-matrix.html`, `execution-ledger.html`, `data-quality-gate.html`, `microstructure-liquidity.html`, `survival-gate.html`, `sovereign-enclave.html`, `relative-value-basis.html`, `billing.html`, `regime-attribution.html`, `fdr-multiple-testing-gate.html`, `style-guide.html`, `portfolio-cvar-stress.html`, `orderbook-imbalance-lob.html`, `rough-volatility-hurst.html`, `leadlag-hayashi-yoshida.html`, `optimal-execution-almgren-chriss.html`, `regime-switching-hamilton-hmm.html`, `hrp-allocator.html`).
2. Top header with `Martingale Optimal Transport (Beiglböck-Henry-Labordère-Penkner) • Dupire Local Volatility σ_loc(K,T) • Static Arbitrage Fence • PAPER_ONLY • ADR-001` badge and `Solve Sinkhorn-Martingale Dual` button.
3. 3 Telemetry KPI Cards:
   - Butterfly & Calendar Arbitrage Violations: `0 / 64 STRIKE-TENOR NODES` (`Breeden-Litzenberger ∂²C/∂K² ≥ 0 & ∂w/∂T ≥ 0 Verified`)
   - Martingale Transport Bounds Width ($\sup \mathbb{E}^\mathbb{Q}[c] - \inf \mathbb{E}^\mathbb{Q}[c]$): `[14.20 bps, 19.85 bps]` (`Model-Free Super/Sub-Replication Corridor`)
   - Entropic Sinkhorn-Martingale Convergence ($\varepsilon_{\text{mart}}$): `1.42 × 10⁻⁷` (`Dual Potentials φ(S₁), ψ(S₂) & h(S₁)·(S₂ - S₁) Converged in 38 Iterations`)
4. Multi-Tenor Dupire Local Volatility & SVI Arbitrage-Free Surface Matrix comparing Log-Moneyness $k = \ln(K/F)$, Implied Total Variance $w(k,T)$, Dupire Local Volatility $\sigma_{\text{loc}}(K,T)$, Risk-Neutral Density $q(K) = e^{rT}\frac{\partial^2 C}{\partial K^2}$, MOT Sub/Super-Hedge Bounds, and Surface Fence Status.
5. Interactive Breeden-Litzenberger Risk-Neutral Density & Kantorovich-Martingale Coupling Simulator across BTC and ETH options/perpetual volatility surfaces.
