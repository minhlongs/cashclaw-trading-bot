# Page Override Specification — `rough-path-signatures.html` (Screen #24)

- **Page Slug:** `rough-path-signatures`
- **Target File:** `site/public/rough-path-signatures.html`
- **Quantitative Domain:** Lyons (1998) Rough Path Theory, Chen (1957) Iterated-Integral Path Signatures $S^{(N)}(X)_{s,t}$, Antisymmetric Lévy Area $A_{s,t}^{ij} = \frac{1}{2}(S_{s,t}^{i,j} - S_{s,t}^{j,i})$ Lead-Lag Extraction & Expected Signature Mahalanobis Anomaly Detection
- **Parent Master:** `design-system/MASTER.md`

---

## 1. Visual Hierarchy & Layout Architecture (`1440px` Container)

1. **Left Sidebar (`240px` Fixed):**
   - Active navigation state on **Rough Path Signatures** (`bg-[var(--bg-elevated)] text-[var(--color-accent)] border border-[var(--border-default)]`).
   - Complete 24-screen navigation list with zero broken links.
   - Bottom engine badge: `Lyons (1998) + Chen (1957)` • `LÉVY AREA • ZERO-LOOKAHEAD`.

2. **Top Header Bar (`64px` Height):**
   - Title: `Lyons Rough Path Iterated-Integral Signatures S^(N)(X)_{s,t} & Lévy Area Lead-Lag Anomaly Classifier`
   - Safety & Methodology Pill: `Lyons (1998) Rough Path Theory • Chen Iterated Integrals S^(1), S^(2), S^(3) • Antisymmetric Lévy Area A_{s,t}^{ij} • PAPER_ONLY • ADR-001`
   - Action Controls: Cross-link to `leadlag-hayashi-yoshida.html` (`Hayashi-Yoshida Lead-Lag`) + primary CTA button `Recompute Chen Signature Tensor` (`#00D4AA` fill, updates UTC audit stamp) + `Export JSON Telemetry` control.

3. **Row 1 — 3 Quantitative Telemetry KPI Cards:**
   - **Card 1 (Dominant Antisymmetric Lévy Area $A_{s,t}^{\text{BTC},\text{ETH}}$):** `+4.18e-4` (`#00D4AA` Emerald), showing $A_{s,t}^{1,2} = \frac{1}{2}(S_{s,t}^{1,2} - S_{s,t}^{2,1}) > 0$ (BTC-PERP path cyclically leads ETH-PERP; strictly invariant to time reparameterization $\tilde{X}_u = X_{\psi(u)}$).
   - **Card 2 (Expected Signature Mahalanobis Anomaly Score $D_{\text{sig}}(X_{[s,t]})$):** `1.64 σ` (`#A78BFA` Amethyst), showing distance in truncated tensor algebra $T^{(3)}(\mathbb{R}^4)$ against stationary regime expected signature $\mu_{\text{sig}} = \mathbb{E}[\mathbf{S}^{(3)}(X)]$ (`< 3.0σ` survival gate threshold).
   - **Card 3 (Chen Identity & Level-3 Tensor Decay $\|S^{(3)}(X)_{s,t}\|_{\text{HS}}$):** `2.84e-6` (`#00D4AA` Emerald), verifying neo-classical factorial decay $\|S^{(k)}(X)_{s,t}\| \le \frac{\|X\|_{p\text{-var}}^k}{(k/p)!}$ with empirical $p$-variation roughness $p = 2.18 \in (2, 3)$ (Geometric Rough Path $G\Omega_p(\mathbb{R}^d)$).

4. **Row 2 — 12-Column Analytical Split:**
   - **Left 7 Columns (Bivariate Phase-Space Trajectory & Signed Lévy Area Chord Loops SVG):**
     - Crisp inline SVG chart visualizing the oriented phase-space path $(X_u^1, X_u^2)_{u \in [s,t]}$ (Normalized BTC-PERP vs. ETH-PERP log-price increments) sweeping a positive counterclockwise enclosed chordal Lévy area $A_{s,t}^{1,2} = \frac{1}{2}\int_s^t ((X_u^1 - X_s^1)dX_u^2 - (X_u^2 - X_s^2)dX_u^1)$, alongside the multi-level tensor norm spectrum $\|S^{(1)}\|, \|S^{(2)}\|, \|S^{(3)}\|$.
     - Explicit formula callouts for Chen's Identity $S(X)_{s,u} = S(X)_{s,t} \otimes S(X)_{t,u}$ and Shuffle Product Linearization $S^I(X) S^J(X) = \sum_{K \in I \sqcup\sqcup J} S^K(X)$.
   - **Right 5 Columns (4x4 Antisymmetric Lévy Area Matrix $A_{s,t}^{ij}$ & Tensor Algebra Spectrum):**
     - Skew-symmetric $4 \times 4$ matrix ($A_{s,t}^{ij} = -A_{s,t}^{ji}$, $A_{s,t}^{ii} = 0$) across `X¹: BTC-PERP`, `X²: ETH-PERP`, `X³: SOL-PERP`, and `X⁴: LOB-OFI`.
     - Level-$k$ tensor dimension and factorial decay audit ($d=4 \implies d + d^2 + d^3 = 4 + 16 + 64 = 84$ scalar signature features).

5. **Row 3 — Truncated Signature Feature Tensor & Ridge-Regularized Alpha Classifier Table:**
   - Full-width `tabular-nums` table inspecting top multi-index words $I \in \{1,\dots,4\}^{\le 3}$ (Level-1 increments $S^{i}$, Level-2 Symmetric Covariation $\text{Sym}(S^{i,j})$, Level-2 Antisymmetric Lévy Area $A^{i,j}$, and Level-3 Lead-Lag Acceleration $S^{i,j,k}$), reporting Raw Tensor Value, Z-Score vs. Ergodic Mean, Shuffle-Linearized Ridge Weight $w_I$, Marginal IC Contribution, and Reparameterization Invariance Verification.
