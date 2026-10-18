# Page Override Specification — `martingale-optimal-transport.html` (Screen #23)

- **Page Slug:** `martingale-optimal-transport`
- **Target File:** `site/public/martingale-optimal-transport.html`
- **Quantitative Domain:** Beiglböck-Henry-Labordère-Penkner (2013) Martingale Optimal Transport (MOT), Breeden-Litzenberger (1978) Risk-Neutral Density Extraction, Gatheral (2014) SVI / eSSVI Static Arbitrage Fence & Dupire (1994) Local Volatility Surface $\sigma_{\text{loc}}(K, T)$
- **Parent Master:** `design-system/MASTER.md`

---

## 1. Visual Hierarchy & Layout Architecture (`1440px` Container)

1. **Left Sidebar (`240px` Fixed):**
   - Active navigation state on **Martingale Optimal Transport** (`bg-[var(--bg-elevated)] text-[var(--color-accent)] border border-[var(--border-default)]`).
   - Complete 24-screen navigation list with zero broken links.
   - Bottom engine badge: `Beiglböck-HLP (2013) + Dupire (1994)` • `NO-STATIC-ARB • ZERO-LOOKAHEAD`.

2. **Top Header Bar (`64px` Height):**
   - Title: `Beiglböck-Henry-Labordère-Penkner Martingale Optimal Transport & Model-Free Dupire Local Volatility Surface`
   - Safety & Methodology Pill: `Martingale Optimal Transport • Breeden-Litzenberger q(K) ≥ 0 • Dupire σ_loc(K,T) • PAPER_ONLY • ADR-001`
   - Action Controls: Cross-link to `rough-volatility-hurst.html` (`Rough Vol Surface`) + primary CTA button `Solve Sinkhorn-Martingale Dual` (`#00D4AA` fill, updates UTC audit stamp) + `Export JSON Telemetry` control.

3. **Row 1 — 3 Quantitative Telemetry KPI Cards:**
   - **Card 1 (Butterfly & Calendar Static Arbitrage Fence):** `0 / 64 STRIKE-TENOR NODES` (`#00D4AA` Emerald), displaying Breeden-Litzenberger convexity $\partial^2 C / \partial K^2 \ge 0$ (`g(k) >= +0.0042`) and calendar monotonicity $\partial w(k,T) / \partial T \ge 0$.
   - **Card 2 (Martingale Transport Super/Sub-Replication Corridor):** `[14.20 bps, 19.85 bps]` (`#A78BFA` Amethyst), showing $\inf_{\pi \in \mathcal{M}(\mu_1,\mu_2)} \mathbb{E}^\pi[c(S_1,S_2)]$ vs. $\sup_{\pi \in \mathcal{M}(\mu_1,\mu_2)} \mathbb{E}^\pi[c(S_1,S_2)]$ model-free corridor width (`5.65 bps`).
   - **Card 3 (Entropic Sinkhorn-Martingale Dual Convergence $\varepsilon_{\text{mart}}$):** `1.42e-7` (`#00D4AA` Emerald), showing dual potentials $\phi(S_1) + \psi(S_2) + h(S_1)(S_2 - S_1) \le c(S_1,S_2)$ and martingale error $\|\mathbb{E}^\pi[S_2 \mid S_1] - S_1\|_\infty = 1.42 \times 10^{-7}$ in `38` Newton-Sinkhorn iterations.

4. **Row 2 — 12-Column Analytical Split:**
   - **Left 7 Columns (Dupire Local Volatility $\sigma_{\text{loc}}(k,T)$ Multi-Tenor Smile & MOT Bounds SVG):**
     - Crisp inline SVG chart plotting 7D, 30D, and 90D Dupire local volatility smiles $\sigma_{\text{loc}}(k, T) = \sqrt{\frac{\partial w / \partial T}{1 - \frac{k}{w}\frac{\partial w}{\partial k} + \frac{1}{4}(-\frac{1}{4} - \frac{1}{w} + \frac{k^2}{w^2})(\frac{\partial w}{\partial k})^2 + \frac{1}{2}\frac{\partial^2 w}{\partial k^2}}}$ across log-moneyness $k = \ln(K/F) \in [-0.30, +0.30]$, overlaid with shaded MOT sub/super-replication volatility corridor.
     - Explicit formula callouts for the Dupire PDE and Beiglböck-HLP Dual LP with delta-hedging multiplier $h(S_1)$.
   - **Right 5 Columns (Breeden-Litzenberger Risk-Neutral Density $q(K)$ & Kantorovich-Martingale Coupling Matrix):**
     - Inline SVG chart of extracted risk-neutral density $q(K) = e^{rT} \frac{\partial^2 C}{\partial K^2}$ for $T_1 = 7\text{D}$ ($\mu_1$) and $T_2 = 30\text{D}$ ($\mu_2$) with left-skewed crash tail annotation and non-negativity fence $q(K) \ge 0$.
     - 4x4 Bivariate Martingale Coupling Support $\pi^*(S_1, S_2)$ table verifying $\sum_j \pi_{ij}(S_{2,j} - S_{1,i}) = 0$.

5. **Row 3 — Multi-Tenor Strike-Node Dupire & MOT Arbitrage Audit Table:**
   - Full-width `tabular-nums` data table across 8 strike/log-moneyness nodes ($k \in \{-0.25, -0.15, -0.08, 0.00, +0.08, +0.15, +0.25, +0.35\}$), reporting Implied Vol $\sigma_{\text{IV}}$, Total Variance $w(k,T)$, Durrleman Butterfly Density $g(k)$, Dupire Local Vol $\sigma_{\text{loc}}(K,T)$, MOT Sub-Hedge Bound, MOT Super-Hedge Bound, Optimal Delta Hedge $h^*(S_1)$, and Static Arbitrage Gate Status.
