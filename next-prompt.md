---
page: limit-order-queue-reactive
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
Design the **Huang-Lehalle-Rosenbaum Queue-Reactive Limit Order Book & Fill-Probability Survival Cockpit** (`limit-order-queue-reactive.html`) for CashClaw OS (`src/forest/microstructure/` & `src/forest/execution/` State-Dependent Birth-Death Queue Dynamics & Passive Fill Survival Engine).
Include:
1. Left sidebar (`240px`) with active state on "Queue-Reactive LOB" and wired links to all 24 CashClaw OS screens (`index.html`, `alpha-zoo.html`, `deliberation-theater.html`, `strategies/volatility-dca.html`, `correlation-matrix.html`, `execution-ledger.html`, `data-quality-gate.html`, `microstructure-liquidity.html`, `survival-gate.html`, `sovereign-enclave.html`, `relative-value-basis.html`, `billing.html`, `regime-attribution.html`, `fdr-multiple-testing-gate.html`, `style-guide.html`, `portfolio-cvar-stress.html`, `orderbook-imbalance-lob.html`, `rough-volatility-hurst.html`, `leadlag-hayashi-yoshida.html`, `optimal-execution-almgren-chriss.html`, `regime-switching-hamilton-hmm.html`, `hrp-allocator.html`, `martingale-optimal-transport.html`, `rough-path-signatures.html`).
2. Top header with `Huang-Lehalle-Rosenbaum (2015) Queue-Reactive LOB • Birth-Death Infinitesimal Generator Q(q) • Passive Fill Survival Probability • PAPER_ONLY • ADR-001` badge and `Re-Calibrate Queue Intensities` button.
3. 3 Telemetry KPI Cards:
   - Best-Bid Queue Depletion Probability ($P(\tau_{\text{deplete}} < \tau_{\text{fill}} \mid q_1 = 14.2\text{ BTC})$): `0.184` (`81.6% Passive Limit Fill Survival • Low Adverse Selection`)
   - Queue-Reactive Cancellation Intensity Ratio ($\lambda^{\text{cancel}}(q_1) / \lambda^{\text{add}}(q_1)$): `0.742` (`Sub-Critical Queue Drift • Mean-Reverting L1 Depth`)
   - Expected Time-to-Fill at Queue Rank $r = 4.8\text{ BTC}$ ($\mathbb{E}[\tau_{\text{fill}}(r, q_1)]$): `1.84 s` (`Infinitesimal Generator First-Passage Solution`)
4. State-Dependent Queue-Reactive Intensity Curves $\lambda^{\text{add}}(q_i), \lambda^{\text{cancel}}(q_i), \lambda^{\text{exec}}(q_i)$ across L1–L5 price levels and queue size buckets $q \in [0, 50\text{ BTC}]$.
5. Interactive Passive Limit Order Queue-Position Simulator comparing Queue Rank $r / q_1$, Fill Probability before Mid-Price Jump, Post-Fill Adverse Selection $\mathbb{E}[\Delta S_{\tau+\delta} \mid \text{Fill}]$, and Cont-Kukanov Maker/Taker Switch Threshold.
