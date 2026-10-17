---
page: regime-switching-hamilton-hmm
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
Design the **Hamilton (1989) Markov-Switching Regime Filter & Filtered State Probability Surface** (`regime-switching-hamilton-hmm.html`) for CashClaw OS (`src/forest/regime/` & `src/forest/evaluation/` Causal Hidden Markov Model & Ergodic Transition Engine).
Include:
1. Left sidebar (`240px`) with active state on "Hamilton HMM Filter" and wired links to all 20 CashClaw OS screens (`index.html`, `alpha-zoo.html`, `deliberation-theater.html`, `strategies/volatility-dca.html`, `correlation-matrix.html`, `execution-ledger.html`, `data-quality-gate.html`, `microstructure-liquidity.html`, `survival-gate.html`, `sovereign-enclave.html`, `relative-value-basis.html`, `billing.html`, `regime-attribution.html`, `fdr-multiple-testing-gate.html`, `style-guide.html`, `portfolio-cvar-stress.html`, `orderbook-imbalance-lob.html`, `rough-volatility-hurst.html`, `leadlag-hayashi-yoshida.html`, `optimal-execution-almgren-chriss.html`).
2. Top header with `Hamilton (1989) Causal Markov-Switching Filter • Zero-Lookahead Filtered State Probabilities ξ_{t|t} • PAPER_ONLY • ADR-001` badge and `Run Baum-Welch / Hamilton Filter` button.
3. 3 Telemetry KPI Cards:
   - Filtered Crisis State Probability ($\xi_{t|t}^{(2)}$): `P(S_t = HIGH_VOL | Ω_t) = 0.842` (`Causal Forward Filter • Zero Kim-Smoother Lookahead`)
   - Ergodic Regime Persistence ($p_{11} / p_{22}$): `0.964 / 0.892` (`Expected Duration: 27.8 Bars Low-Vol / 9.3 Bars High-Vol`)
   - Log-Likelihood Ratio vs Single-Regime Gaussian: `2Δℓ = +148.6 (p < 10⁻⁶)` (`Markov Regime-Switching Strongly Favored`)
4. Markov Transition Probability Matrix ($P_{ij}$) & State-Conditional Emission Parameters ($\mu_k, \sigma_k$, Ergodic Stationary Weights $\pi_k$, Expected Regime Duration $1/(1 - p_{kk})$, and Dynamic Paper Sizing Multiplier).
5. Interactive Causal Filtered Probability ($\xi_{t|t}$) vs Non-Causal Smoothed Probability ($\xi_{t|T}$) Comparison Inspector demonstrating why CashClaw OS strictly enforces $\xi_{t|t}$ online filtering to prevent lookahead leakage.
