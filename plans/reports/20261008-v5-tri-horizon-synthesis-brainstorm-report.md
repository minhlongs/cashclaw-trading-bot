# Brainstorming Report: Full Tri-Horizon Synthesis (v5 Quantitative Architecture)

**Date:** 2026-10-08  
**Scope:** Trade-Bot Full-Suite v5 Quantitative Upgrade  
**Paradigm:** ADR-001 Paper-Only, Edge-Native WebCrypto, 0 `:any`, $\le 200$ LOC per file, 100% Test Coverage on Math Modules.

---

## 1. Problem Statement & Strategic Objective
Hệ thống Trade-Bot đã hoàn thiện thành công các tầng L2 Cockpit UI, Microstructure VPIN/OFI, Smart Order Routing (SOR/TWAP), và Pairs Stat-Arb (Kalman Filter + OU). Tuy nhiên, để vận hành như một Quantitative Hedge Fund tự động hóa cấp cao, hệ thống cần:
1. **Pillar 1 - Graph Arbitrage:** Khả năng phát hiện và khai thác tức thời chu trình chênh lệch giá tam giác phi rủi ro (Triangular Arbitrage Cycle) trên đồ thị tỷ giá 3 chân trước khi cơ hội biến mất.
2. **Pillar 2 - Adaptive Capital Allocation:** Khả năng tự động điều tiết phân bổ vốn giữa các bot/chiến lược dựa trên học tăng cường Bayesian (Thompson Sampling Multi-Armed Bandit) theo pha thị trường biến động (Markov Regime).
3. **Pillar 3 - Synthetic Greeks & Delta Hedging:** Khả năng tính toán chính xác độ nhạy rủi ro danh mục (Delta, Gamma, Vega, Theta) và tự động sinh tín hiệu cân bằng Delta-neutral bảo toàn vốn.

---

## 2. Core Architectural Pillars

### Pillar 1: Graph-Theoretic Triangular Arbitrage Engine
- **Mục tiêu:** Tìm kiếm chu trình chênh lệch tỷ giá $A \to B \to C \to A$ (ví dụ: USDT $\to$ BTC $\to$ ETH $\to$ USDT) có lợi nhuận dương sau khi trừ phí giao dịch và tác động trượt giá.
- **Mô hình Toán học:**
  - Chuyển đổi đồ thị tỷ giá có hướng $G = (V, E)$ với trọng số cạnh:
    $$w(u, v) = -\ln(R_{u \to v} \times (1 - \text{fee}_{u \to v}))$$
  - Chu trình có lãi $\prod R_i (1 - \text{fee}_i) > 1$ tương đương với chu trình âm $\sum w(u, v) < 0$.
  - Thuật toán **Bellman-Ford Negative Cycle Detection** chạy trong $O(V \cdot E)$ với $V \le 10$ cặp tiền chính, tìm ra chu trình arbitrage tối ưu nhất với latency $< 1\text{ms}$.
  - Kiểm tra dung lượng thanh khoản nhỏ nhất trên 3 chân (bottleneck liquidity depth) để định kích thước lệnh thực thi khả thi.

### Pillar 2: Adaptive Regime & Bayesian Multi-Armed Bandit Allocator
- **Mục tiêu:** Tự động điều chỉnh tỷ trọng vốn phân bổ cho các chiến lược (`grid`, `mean_reversion`, `volatility_dca`, `statarb`) dựa trên phần thưởng rủi ro (Risk-Adjusted Return / Sortino Ratio) và chế độ biến động thị trường.
- **Mô hình Toán học:**
  - **Markov Regime Classifier:** Phân loại thị trường thành 3 trạng thái: `LOW_VOL_CHOP`, `TRENDING_BULL_BEAR`, `HIGH_VOL_CRISIS` dựa trên Realized Volatility và VPIN toxicity.
  - **Thompson Sampling (Beta-Bernoulli / Gaussian Conjugate Prior):**
    $$\theta_k \sim \text{Beta}(\alpha_k + 1, \beta_k + 1)$$
    $$\text{Weight}_k = \frac{\theta_k}{\sum_j \theta_j}$$
  - Đảm bảo cơ chế thăm dò (exploration) và khai thác (exploitation) tối ưu theo lý thuyết thông tin, tránh tình trạng "kẹt vốn" ở chiến lược đang thoái hóa.

### Pillar 3: Synthetic Greeks & Delta-Neutral Hedging Desk
- **Mục tiêu:** Đo lường độ nhạy rủi ro bậc một và bậc hai của toàn bộ danh mục tài sản crypto đối với biến động giá và thời gian, sinh kế hoạch phòng vệ tự động.
- **Mô hình Toán học:**
  - Closed-form Black-76 / Garman-Kohlhagen analytics cho cấu trúc vị thế:
    - Delta $\Delta = \frac{\partial V}{\partial S}$
    - Gamma $\Gamma = \frac{\partial^2 V}{\partial S^2}$
    - Vega $\mathcal{V} = \frac{\partial V}{\partial \sigma}$
    - Theta $\Theta = \frac{\partial V}{\partial t}$
  - Bộ kiểm soát độ trôi Delta (**Delta Drift Guard**): Khi net delta danh mục vượt khỏi dải mục tiêu $|\Delta_{\text{net}}| > \Delta_{\text{threshold}}$, tự động sinh chỉ thị phòng vệ qua hợp đồng tương lai hoặc tài sản cơ sở.

---

## 3. Implementation Phasing Strategy

| Phase | Module | Files Dự Kiến | Mục Tiêu |
|---|---|---|---|
| **Phase 01** | Graph Triangular Arbitrage | `src/tree/quantlib/arbitrage/triangular-rate-graph.ts`<br>`src/tree/quantlib/arbitrage/bellman-ford-detector.ts`<br>`src/tree/quantlib/arbitrage/triangular.test.ts` | Xây dựng đồ thị tỷ giá logarit, phát hiện chu trình âm, tính toán net profit sau phí 3 chân |
| **Phase 02** | Adaptive Regime MAB Allocator | `src/forest/allocation/bandit/thompson-sampling-bandit.ts`<br>`src/forest/allocation/bandit/regime-bandit-coordinator.ts`<br>`src/forest/allocation/bandit/bandit.test.ts` | Phân loại chế độ biến động, phân bổ vốn thích nghi qua Thompson Sampling với exploration floor |
| **Phase 03** | Synthetic Greeks Hedging Desk | `src/tree/quantlib/greeks/synthetic-greeks-engine.ts`<br>`src/tree/quantlib/greeks/delta-neutral-hedger.ts`<br>`src/tree/quantlib/greeks/greeks.test.ts` | Tính toán Black closed-form Greeks, theo dõi net delta drift và sinh kế hoạch rebalance phòng vệ |
| **Phase 04** | Cross-Stack E2E Verification & Gates | `test/e2e/full-suite-v5-tri-horizon.test.ts`<br>`plans/reports/v5-tri-horizon-verification-report.md` | E2E integration test liên kết cả 3 trụ cột v5, toàn bộ test suite xanh 100%, 0 `:any`, build Next.js pass |

---

## 4. Quality & Safety Invariants
1. **Paper-Only (ADR-001):** Mô phỏng khớp lệnh thực tế, 0 real capital, 0 live exchange order placement.
2. **Edge Runtime Native:** 100% WebCrypto, không sử dụng native math C bindings hay thư viện Node-only.
3. **Strict Code Limits:** Mỗi file $\le 160$ LOC (trần 200 LOC), zero `:any`, zero ESLint warnings.
4. **Test Coverage:** 100% statement/branch/line coverage trên các module lượng hóa toán học mới.
