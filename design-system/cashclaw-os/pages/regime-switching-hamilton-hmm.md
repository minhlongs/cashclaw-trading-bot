# Page Override: `regime-switching-hamilton-hmm.html` — Hamilton (1989) Markov-Switching Regime Filter & Filtered State Probability Surface

> **PROJECT:** CashClaw OS (`cashclaw-quant-os`)
> **Stitch Screen Resource:** `projects/6665149401860401191` (Wave 4 Screen #21)
> **Parent Contract:** Inherits all tokens and accessibility rules from `design-system/MASTER.md` and `DESIGN.md`.

---

## 1. Page-Specific Domain & Visual Architecture

- **Primary Quantitative Engine:** Hamilton (1989) 2-State / 3-State Markov-Switching Autoregressive Regime Filter (`src/forest/regime/` & `src/forest/evaluation/`).
- **Causal Invariant Highlighted:** Strict visual and mathematical separation between **Causal Hamilton Filtered State Probabilities** $\xi_{t|t}^{(k)} = P(S_t = k \mid \Omega_t)$ (allowed for live paper gating) and **Non-Causal Kim (1994) Smoothed Probabilities** $\xi_{t|T}^{(k)} = P(S_t = k \mid \Omega_T)$ (offline diagnostic only — blocked from signal generation to prevent lookahead bias).

## 2. Layout & Component Specifications

1. **Top Header Bar:**
   - Title: `Hamilton (1989) Markov-Switching Regime Filter & Filtered State Probability Surface`
   - Badge: `Hamilton (1989) Causal Markov-Switching Filter • Zero-Lookahead Filtered State Probabilities ξ_{t|t} • PAPER_ONLY • ADR-001`
   - Primary CTA (`min-h-[44px]`): `Run Baum-Welch / Hamilton Filter` (`#00D4AA` Quant Emerald fill, `#0B0E11` text).
2. **3 Telemetry KPI Cards (`grid-cols-3`):**
   - **Card 1 — Filtered High-Vol State Probability ($\xi_{t|t}^{(2)}$):** `P(S_t = HIGH_VOL | Ω_t) = 0.842` (`Causal Forward Filter • Zero Kim-Smoother Lookahead`, `#FFB020` Amber Caution accent).
   - **Card 2 — Ergodic Regime Persistence ($p_{11} / p_{22}$):** `0.964 / 0.892` (`Expected Duration: 27.8 Bars Low-Vol / 9.3 Bars High-Vol`, `#A78BFA` Deliberation Violet accent).
   - **Card 3 — Log-Likelihood Ratio ($2\Delta\ell$):** `+148.6 (p < 10⁻⁶)` (`Markov Regime-Switching Strongly Favored Over Single Gaussian`, `#00D4AA` Quant Emerald accent).
3. **Markov Transition Probability Matrix ($P_{ij}$) & Emission Table:**
   - Accessible `<table aria-label="Markov Transition and Emission Parameters">` with `aria-sort` column headers and `font-variant-numeric: tabular-nums`.
   - Columns: Regime State $S_t$, Transition Row $[p_{i1}, p_{i2}, p_{i3}]$, Conditional Drift $\mu_k$, Conditional Volatility $\sigma_k$, Ergodic Stationary Weight $\pi_k$, Expected Duration $\mathbb{E}[D_k] = \frac{1}{1 - p_{kk}}$, and Paper Sizing Multiplier.
4. **Interactive Causal Filtered ($\xi_{t|t}$) vs Kim Smoothed ($\xi_{t|T}$) Probability Surface Simulator:**
   - Left 5 columns: Self-transition probability sliders ($p_{11}, p_{22}$) and regime threshold cutoff ($\tau_{\text{gate}} \in [0.50, 0.95]$).
   - Right 7 columns: Dual-trajectory SVG time-series surface comparing causal $\xi_{t|t}$ (`#00D4AA`) against lookahead-smoothed $\xi_{t|T}$ (`#A78BFA` dashed) with shaded crisis regime fence zones (`#FF4757`).
