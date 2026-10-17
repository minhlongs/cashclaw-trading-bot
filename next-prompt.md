---
page: orderbook-imbalance-lob
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
Design the **L3 Order Book Imbalance & Hawkes Process Micro-Burst Predictor** (`orderbook-imbalance-lob.html`) for CashClaw OS (`src/forest/microstructure/` & `src/forest/execution/` LOB Queue Depletion & Self-Exciting Hawkes Arrival Engine).
Include:
1. Left sidebar (`240px`) with active state on "LOB Hawkes Imbalance" and wired links to all 16 CashClaw OS screens (`index.html`, `alpha-zoo.html`, `deliberation-theater.html`, `strategies/volatility-dca.html`, `correlation-matrix.html`, `execution-ledger.html`, `data-quality-gate.html`, `microstructure-liquidity.html`, `survival-gate.html`, `sovereign-enclave.html`, `relative-value-basis.html`, `billing.html`, `regime-attribution.html`, `fdr-multiple-testing-gate.html`, `style-guide.html`, `portfolio-cvar-stress.html`).
2. Top header with `L3 Order Book Imbalance • Self-Exciting Hawkes Process λ(t) • VPIN Flow Toxicity Fence • PAPER_ONLY` badge and `Calibrate Hawkes Kernel` button.
3. 3 Telemetry KPI Cards:
   - Top-5 Queue Order Book Imbalance (OBI): `+0.418 (Bid-Heavy Skew)` (`Cont-Kukanov-Stoikov Linear Impact • 250ms Horizon`)
   - Hawkes Branching Ratio ($\eta = \alpha / \beta$): `0.784 (Sub-Critical Clustering)` (`Self-Exciting Trade Arrival Intensity λ(t) = 42.6 events/s`)
   - VPIN Informed Flow Toxicity Percentile: `91.4% (TOXIC_FLOW_ALERT)` (`Maker Quote Pull Fence Triggered Above 90th Percentile`)
4. Multi-Level L2/L3 Limit Order Book Depth & Queue Depletion Matrix comparing Bid/Ask Queue Sizes, Cancel-to-Fill Ratios, Micro-Price Deviation ($\Delta P_{\text{micro}}$), Hawkes Excitation Contribution, and Execution Routing Verdict (`PASSIVE_MAKER`, `TWAP_SLICE`, `HALT_TOXIC_SWEEP`).
5. Interactive Hawkes Intensity Decay Kernel ($\alpha e^{-\beta(t - t_i)}$) & VPIN Bucket Simulator showing micro-burst clustering and adverse selection protection across BTC-USDT, ETH-USDT, SOL-USDT, and BNB-USDT paper books.
