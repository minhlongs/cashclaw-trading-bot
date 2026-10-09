# Báo Cáo Brainstorming: Tái Cấu Trúc Toàn Diện & Nền Tảng Định Lượng v11 (Unified Execution OMS, Alpha Lab Vectorization & v11 Quant Desk)

**Ngày ghi nhận:** 2026-10-09  
**Trạng thái:** Đồng thuận (Consensus Reached)  
**Tác giả:** Antigravity (Pair Programming với User)  
**Tiêu chuẩn áp dụng:** YAGNI, KISS, DRY, ADR-001 (Paper/Backtest Only), File <= 200 LOC, 0 `:any`.

---

## 1. Bài Toán & Yêu Cầu Kỹ Thuật (Problem Statement & Requirements)

### 1.1. Hiện trạng & Nút thắt (Bottlenecks)
1. **Phân mảnh thực thi (Execution Fragmentation):**
   - Hiện hệ thống có nhiều module độc lập: `RfqDarkMeshRouter` (khớp P2P), `SorRouter` (Smart Order Routing), `TwapSlicer`/`VwapScheduler` (chia nhỏ lệnh), và `MicrostructureUrgencyGuard`.
   - Chưa có một pipeline thống nhất chuẩn OMS/EMS để dẫn xuất lệnh theo thứ tự ưu tiên tối ưu chi phí (Waterfall Execution).
2. **Nợ kỹ thuật Alpha Lab (Technical Debt in Research Layer):**
   - Thư mục `TradingAgents` có hơn 65 files nhỏ với nhiều lớp adapter trung gian (`toEvaluationReport`, `toWalkForwardShim`, `run-deliberation-helpers`).
   - Việc tính toán Factor IC/IR, Quantile Analysis và Correlation trên mảng đối tượng tiêu tốn nhiều bộ nhớ và chậm khi quy mô dữ liệu mở rộng.
3. **Mở rộng năng lực định lượng v11 (v11 Quant Expansion):**
   - Cần bổ sung các mô hình định lượng tiên tiến: Dynamic Kalman Cointegration, Transient Market Impact theo luật lũy thừa (Power-Law Decay), và Greeks Dynamic Hedging Desk.

---

## 2. Thiết Kế Kiến Trúc 3 Trụ Cột Đề Xuất (3-Pillar Architecture)

### Trụ Cột 1: Unified Execution OMS/EMS Waterfall Pipeline
- **Thư mục mục tiêu:** `src/tree/execution/oms/`
- **Kiến trúc luồng xử lý (Waterfall):**
  ```
  Inbound Strategy Order
            │
            ▼
  ┌────────────────────────────────────────┐
  │ Step 1: Internal Dark Mesh Crossing   │ ──► [Matched: 100% Fee Saved]
  │ (RfqDarkMeshRouter @ Mid-Price)        │
  └───────────────────┬────────────────────┘
                      │ (Unmatched Residual)
                      ▼
  ┌────────────────────────────────────────┐
  │ Step 2: Microstructure Urgency Guard   │ ──► [Adverse Toxic Flow: Throttle / Reject]
  │ (VPIN / OFI / Spread Spike Gate)       │
  └───────────────────┬────────────────────┘
                      │ (Pass Guard)
                      ▼
  ┌────────────────────────────────────────┐
  │ Step 3: Algorithmic Slicing Schedule   │ ──► [TWAP / VWAP Time Slices]
  │ (TwapSlicer / VwapScheduler)           │
  └───────────────────┬────────────────────┘
                      │
                      ▼
  ┌────────────────────────────────────────┐
  │ Step 4: Multi-Venue SOR Dispatch       │ ──► [Optimal Venue Selection]
  │ (SorRouter + Paper / REST Client)      │
  └────────────────────────────────────────┘
  ```
- **State Machine chuẩn:** `ExecutionOrder` (`SUBMITTED` -> `CROSSING` -> `SLICING` -> `ROUTING` -> `FILLED` / `REJECTED`).

### Trụ Cột 2: Alpha Lab Consolidation & Vectorized Research Engine
- **Thư mục mục tiêu:** `src/tree/research/vectorized/`, `src/forest/research/tradingagents/`
- **Giải pháp:**
  - Tinh gọn các lớp adapter của TradingAgents: Kết nối thẳng `debateToHypothesis` sang `AlphaCompiler`.
  - **Vectorized Factor Engine:** Chuyển đổi dữ liệu chuỗi thời gian sang `Float64Array` dẹt:
    - Fast Pearson/Spearman Rank Correlation via merge-sort indices.
    - Bootstrap Confidence Interval tính toán song song không cấp phát bộ nhớ dư thừa.
    - Tăng tốc độ backtest và tính toán IC/IR lên 10x - 30x.

### Trụ Cột 3: v11 Quantitative Desk Expansion
- **Thư mục mục tiêu:** `src/tree/quantlib/kalman/`, `src/tree/quantlib/impact/`, `src/tree/quantlib/hedging/`
- **Chi tiết mô hình:**
  1. **Kalman Cointegration Desk (`KalmanCointegrationEngine`):**
     - Mô hình không gian trạng thái (State-Space Model) ước lượng động hệ số cointegration $\beta_t$ và sai số chuẩn giữa 2 tài sản.
     - Tính toán Ornstein-Uhlenbeck (OU) mean-reversion speed $\theta$ và half-life $t_{1/2} = \ln(2)/\theta$.
  2. **Transient Market Impact Engine (`TransientImpactEngine`):**
     - Mô hình hóa tác động thị trường tạm thời với hàm phân rã lũy thừa: $G(t) = \gamma t^{-\alpha}$.
     - Tối ưu hóa quỹ đạo thanh lý danh mục quy mô lớn, tránh tạo dấu chân thanh khoản độc hại.
  3. **Greeks Dynamic Hedging Desk (`GreeksHedgingDesk`):**
     - Đo lường sai lệch Delta, Gamma, Vega của danh mục phái sinh tổng hợp.
     - Sinh các lệnh tái cân bằng tối thiểu (Minimum Turnover Rebalancing) nhằm duy trì trạng thái trung lập rủi ro.

---

## 3. Đánh Giá Rủi Ro & Biện Pháp Kiểm Soát (Risk Assessment & Mitigation)

| Rủi ro | Mức độ | Biện pháp giảm thiểu |
|---|---|---|
| **Rủi ro hồi quy (Regression Risk)** | Trung bình | Duy trì toàn bộ 5,436 unit/integration tests hiện có; viết test vector mới cho từng engine |
| **Phức tạp toán học v11** | Thấp | Giải nghiệm dạng đóng (closed-form) và công thức ma trận chuẩn; không dùng thư viện ngoài |
| **Ràng buộc an toàn ADR-001** | Tuyệt đối | Chỉ chạy trong môi trường Paper/Backtest mô phỏng, tuyệt đối không có bề mặt live order |
| **Giới hạn số dòng file (LOC)** | Thấp | Mọi module $\le 130$ LOC, phân tách file types/engine/test độc lập |

---

## 4. Tiêu Chí Thành Công & Kế Hoạch Kiểm Định (Success Criteria)

1. **Hạ tầng OMS/EMS:** Toàn bộ chu trình từ lệnh chiến lược đến Dark Mesh, Slicing và SOR hoạt động liên hoàn với 100% test coverage.
2. **Vectorized Engine:** Giảm thời gian tính toán IC/IR trên 1,000 bars x 5 factors xuống dưới 50ms, bảo toàn kết quả so với module cũ.
3. **v11 Quant Suite:** 3 engine toán học (Kalman, Transient Impact, Greeks Hedging) đạt 100% branch/statement coverage.
4. **Chất lượng toàn hệ thống:** 0 lỗi TypeScript (`tsc --noEmit`), 0 lỗi ESLint, 0 kiểu `:any`, Next.js build xanh hoàn toàn.
