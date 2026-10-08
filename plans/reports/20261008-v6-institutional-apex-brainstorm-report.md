# Báo Cáo Chiến Lược: v6 Institutional Apex OS (Full Synthesis)

## 1. Problem Statement & Scope
- **Problem:** Trade-Bot hiện sở hữu các engine định lượng v4/v5 (Kalman StatArb, Triangular Arb, Black-76 Greeks, MAB Allocator) nhưng đang gặp 3 khoảng trống lớn ở tầng cấp tổ chức:
  1. *Execution Drag:* Taker fee và trượt giá nuốt lợi nhuận; thiếu cơ chế đặt lệnh thụ động Maker tính toán micro-price và vị trí hàng đợi (Queue Position).
  2. *Adverse Selection Risk:* Thiếu luồng đo lường độc hại dòng lệnh liên tục (Streaming VPIN) và mô hình điểm Hawkes Process để tự động rút lệnh khi cá voi quét thanh khoản.
  3. *Portfolio Diversification Collapse:* Ma trận tương quan truyền thống bị suy biến hoặc tăng vọt lên 1.0 trong khủng hoảng thiên nga đen, làm sụp đổ phân bổ vốn đa bot.
- **Scope & Constraints:**
  - ADR-001 Paper-only invariant (0 real capital, 0 live exchange order surface).
  - Pure deterministic TypeScript, WebCrypto native, 0 external C/C++ dependencies.
  - LOC invariant: mọi file $\le 200$ LOC (target $\le 130$ LOC), 0 `:any`, 0 ESLint warnings.
  - 100% test coverage trên các math & quant engine mới, toàn bộ test suite xanh 100%.

---

## 2. Evaluated Approaches & Trade-offs

| Phương án | Ưu điểm | Nhược điểm / Rủi ro | Phán quyết |
|---|---|---|---|
| **Phương án 1: Chỉ làm Smart Limit Router (SLR)** | Tối ưu tức thì phí giao dịch maker rebate (+4-8 bps) | Thiếu mắt xích cảnh báo sập giá vĩ mô và rủi ro đuôi danh mục | Từ chối (quá hẹp) |
| **Phương án 2: Chỉ làm Flow Toxicity & Hawkes Matrix** | Cảnh báo sớm dòng lệnh độc hại và cá voi | Không có cơ chế thực thi bù đắp và tối ưu phân bổ vốn giữa các bot | Từ chối (quá hẹp) |
| **Phương án 3: Chỉ làm HRP & Copula Tail Risk Desk** | Danh mục đa bot kháng khủng hoảng cực tốt | Không giải quyết được trượt giá vi mô ở từng điểm khớp lệnh | Từ chối (quá hẹp) |
| **Phương án 4: Full Institutional Apex (All 3 Synthesis)** | Hợp nhất 3 tầng: Vi mô (Execution) $\to$ Trung mô (Alpha/Toxicity) $\to$ Vĩ mô (Portfolio Risk) | Cần thiết kế module hóa phân tầng độc lập chặt chẽ | **CHỌN (Tối ưu nhất)** |

---

## 3. Recommended Solution: v6 Institutional Apex Architecture

### Pillar 1: Smart Limit Router (SLR Desk) (`src/tree/execution/slr/`)
- `slr-types.ts`: Interface định nghĩa `LimitQueuePlacement`, `MicroPriceEstimate`, `CancelOnToxicityDirective`.
- `micro-price-estimator.ts`: Ước lượng giá vi mô chuẩn xác dựa trên chênh lệch khối lượng sổ lệnh (Order Book Imbalance - OBI):
  $$P_{\text{micro}} = P_{\text{bid}} \cdot \frac{Q_{\text{ask}}}{Q_{\text{bid}} + Q_{\text{ask}}} + P_{\text{ask}} \cdot \frac{Q_{\text{bid}}}{Q_{\text{bid}} + Q_{\text{ask}}}$$
- `queue-priority-tracker.ts`: Tính toán vị trí hàng đợi Poisson và xác suất khớp lệnh Maker trước khi giá chạy.
- `passive-execution-router.ts`: Điều phối đặt lệnh limit tối ưu Maker rebate, kèm bộ kích hoạt hủy lệnh khi giá vi mô lệch ngưỡng (Cancel-on-Toxicity).

### Pillar 2: Microstructure Flow Toxicity & Hawkes Desk (`src/tree/quantlib/toxicity/`)
- `toxicity-types.ts`: Domain models cho `ContinuousVpinState`, `HawkesPointCluster`, `WhaleSweepSignal`.
- `continuous-vpin-streamer.ts`: Thuật toán VPIN cửa sổ trượt theo thể tích (volume bars), đo lường xác suất giao dịch nội gián/độc hại theo thời gian thực.
- `hawkes-process-detector.ts`: Mô hình quá trình điểm tự kích hoạt (Self-exciting Hawkes Process) xấp xỉ giải tích:
  $$\lambda(t) = \mu + \sum_{t_i < t} \alpha e^{-\beta(t - t_i)}$$
  Phát hiện chùm lệnh dồn dập từ cá voi nhằm cảnh báo Signal Fence.

### Pillar 3: Hierarchical Risk Parity (HRP) & Copula Risk Desk (`src/forest/allocation/hrp/`)
- `hrp-types.ts`: Domain models cho ma trận khoảng cách tương quan, cây phân cụm (Dendrogram), và phân bổ vốn HRP.
- `dendrogram-clusterer.ts`: Biến đổi ma trận tương quan $\rho_{ij}$ thành khoảng cách $d_{ij} = \sqrt{\frac{1 - \rho_{ij}}{2}}$, phân cụm liên kết đơn (single-linkage) và sắp xếp tựa chéo (quasi-diagonalization).
- `hrp-capital-allocator.ts`: Phân bổ vốn đệ quy nghịch đảo phương sai từng nhánh mà không cần nghịch đảo ma trận, đảm bảo tính ổn định tuyệt đối kể cả khi ma trận suy biến.
- `copula-tail-risk-guard.ts`: Clayton Copula bất đối xứng đo lường đuôi rủi ro dưới (lower-tail dependence) và tính toán Liquidity-adjusted CVaR.

---

## 4. Implementation Considerations & Risks
- **Tránh Matrix Inversion:** Sử dụng HRP thay vì Markowitz giải quyết triệt để lỗi singular matrix trên JavaScript runtime.
- **LOC Boundary:** Chia nhỏ các phép tính toán học ma trận và Hawkes kernel ra từng file độc lập $\le 130$ LOC.
- **Tốc độ tính toán Edge Worker:** Các xấp xỉ giải tích tối ưu không dùng vòng lặp lồng $O(n^3)$; HRP quasi-diagonalization đạt $O(n^2)$.

---

## 5. Success Metrics & Validation Criteria
1. **Pillar 1:** SLR Desk tính toán micro-price và hàng đợi chính xác, mô phỏng tiết kiệm ít nhất 4 bps phí so với Taker thuần.
2. **Pillar 2:** Continuous VPIN và Hawkes Process nhận diện đúng các chùm biến động đột biến trong các tình huống stress test.
3. **Pillar 3:** HRP Allocator phân bổ trọng số danh mục có tổng bằng 100%, không sinh trọng số âm hoặc NaN trong mọi kịch bản tương quan ngặt nghèo.
4. **Testing & Quality Gates:**
   - E2E test `test/e2e/full-suite-v6-institutional-apex.test.ts` xanh 100%.
   - 0 `:any`, 0 ESLint warnings, 100% test coverage trên các engine mới.
   - Toàn bộ suite hiện có (5,329+ tests) tiếp tục vượt qua không có hồi quy (regression).

---

## 6. Next Steps
- Lập kế hoạch chi tiết (`plans/20261008-v6-institutional-apex-implementation/plan.md`).
- Chia 4 phase thực thi song song theo chuẩn `bootstrap:auto:parallel`.
- Thực hiện triển khai đồng bộ và xác minh E2E.
