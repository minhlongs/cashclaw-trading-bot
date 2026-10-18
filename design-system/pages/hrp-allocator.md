# Page Override: `hrp-allocator.html` — López de Prado (2016) Hierarchical Risk Parity (HRP) & Ledoit-Wolf Shrinkage Eigen-Portfolio Allocator

> **PROJECT:** CashClaw OS (`cashclaw-quant-os`)
> **Stitch Screen Resource:** `projects/6665149401860401191` (Wave 4 Screen #22)
> **Parent Contract:** Inherits all tokens and accessibility rules from `design-system/MASTER.md` and `DESIGN.md`.

---

## 1. Page-Specific Domain & Visual Architecture

- **Primary Quantitative Engine:** López de Prado (2016) 3-Stage Hierarchical Risk Parity (Tree Clustering via Ultrametric Correlation Distance $d_{ij} = \sqrt{\frac{1}{2}(1 - \rho_{ij})}$, Quasi-Diagonalization Seriation, and Recursive Bisection Inverse-Variance Allocation) paired with Ledoit-Wolf (2004) Constant-Correlation Covariance Shrinkage.
- **Numerical Stability Invariant:** Demonstrates why HRP avoids inverting an ill-conditioned covariance matrix $\Sigma^{-1}$ (where Markowitz Critical Line Algorithm suffers from condition number $\kappa(\Sigma) > 480$ when crypto assets converge during deleveraging shocks).

## 2. Layout & Component Specifications

1. **Top Header Bar:**
   - Title: `López de Prado (2016) Hierarchical Risk Parity (HRP) & Ledoit-Wolf Shrinkage Eigen-Portfolio Allocator`
   - Badge: `López de Prado (2016) Hierarchical Risk Parity (HRP) • Tree Clustering & Quasi-Diagonalization • Ledoit-Wolf Shrinkage • PAPER_ONLY • ADR-001`
   - Primary CTA (`min-h-[44px]`): `Re-Cluster & Bisect Portfolio` (`#00D4AA` Quant Emerald fill, `#0B0E11` text).
2. **3 Telemetry KPI Cards (`grid-cols-3`):**
   - **Card 1 — Covariance Condition Number ($\kappa(\Sigma)$ Raw vs Ledoit-Wolf):** `482.4 → 18.6` (`Markowitz Matrix Inversion Singularity Neutralized`, `#00D4AA` Quant Emerald accent).
   - **Card 2 — Out-of-Sample Variance Reduction (HRP vs Markowitz CLA):** `-31.8% OOS Variance` (`Walk-Forward Sharpe +2.14 HRP vs +1.42 CLA`, `#A78BFA` Deliberation Violet accent).
   - **Card 3 — Effective Number of Bets (ENB / Shannon Entropy):** `3.68 / 4.00 Clusters` (`Balanced Recursive Bisection Allocation`, `#FFB020` Amber Caution accent).
3. **HRP Recursive Bisection Allocation & Cluster Seriation Matrix:**
   - Accessible `<table aria-label="HRP Recursive Bisection Portfolio Weights">` with `aria-sort` column headers and `font-variant-numeric: tabular-nums`.
   - Columns: Quasi-Diagonal Leaf Order, Asset / Strategy Leg, Cluster Linkage Distance $d_{i,i+1}$, Naive Equal-Weight ($1/N$), Markowitz CLA Weight ($w_i^{\text{CLA}}$), Inverse-Variance Weight ($w_i^{\text{IVP}}$), HRP Recursive Bisection Weight ($w_i^{\text{HRP}}$), and Component Risk Contribution (%).
4. **Interactive Single-Linkage Dendrogram & Quasi-Diagonalized Correlation Matrix Inspector:**
   - Left 5 columns: Ledoit-Wolf Shrinkage Intensity slider ($\delta \in [0.00, 1.00]$) and linkage metric selector (`Single Linkage`, `Complete Linkage`, `Ward Minimum Variance`).
   - Right 7 columns: SVG Hierarchical Clustering Dendrogram + Quasi-Diagonal Block-Seriated Correlation Heatmap showing recursive bisection split factors $\alpha_k = 1 - \frac{\tilde{V}_L}{\tilde{V}_L + \tilde{V}_R}$.
