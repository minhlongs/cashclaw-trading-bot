# Brainstorming Report: Kiến Trúc Triad v12 (Kyle-Back Adverse Selection, Black-Litterman Portfolio & Waterfall HUD)

**Ngày:** 2026-10-09  
**Phương pháp:** Brainstorming Deep Analysis & Architecture Synthesis  
**Mục tiêu:** Định hình kiến trúc phân tán v12 kế thừa v11, kết nối vi cấu trúc vi mô, phân bổ danh mục Bayes và hiển thị trực quan hóa thời gian thực.

---

## 1. Problem Statement & Requirements

### Hiện trạng sau v11:
- Hệ thống v11 đã hoàn thiện 3 trụ cột cơ bản:
  1. `ExecutionOmsWaterfall` (Dark Mesh $\to$ Urgency Guard $\to$ TWAP Slicing $\to$ SOR).
  2. `VectorizedFactorEngine` (Pearson, Spearman, t-stat IC và Monotonic Quantile Spreads).
  3. Bộ desks: Kalman Cointegration, Transient Market Impact (Bouchaud), Greeks Hedging Desk.
- Tuy nhiên, 3 rào cản kỹ thuật chính còn tồn đọng:
  1. **Khuyết thiếu định giá thanh khoản liên tục (Adverse Selection):** Urgency guard v11 dựa vào ngưỡng tĩnh ($0.2$) và thiếu mô hình lý thuyết vi cấu trúc vi mô để ước lượng hệ số $\lambda$ Kyle-Back, dẫn đến rủi ro bị "snipe" bởi toxic order flow khi cắt lệnh.
  2. **Rời rạc giữa Định tính (LLM Agents) và Định lượng (Portfolio Weights):** Các cuộc tranh luận multi-agent từ `TradingAgents` chỉ dừng lại ở văn bản/prompt advisory, chưa được tích hợp vào mô hình tối ưu hóa danh mục chuẩn mực (Black-Litterman Bayesian framework). Các factor alpha còn bị đa cộng tuyến (multicollinearity).
  3. **Thiếu Telemetry trực quan & Slippage Attribution:** Người vận hành chưa có giao diện HUD thời gian thực để quan sát 4 tầng Waterfall, chưa phân rã được chi phí trượt giá (Spread vs. Temporary Impact vs. Permanent Shift) sau giao dịch.

### Yêu cầu cốt lõi (Non-negotiable invariants):
- **Safety Invariant:** 100% Paper/Backtest mode, ADR-001 bảo toàn tuyệt đối, zero real order execution surface.
- **Complexity & Size:** Mọi file $\le 160$ LOC, 0 `:any` types, 0 ESLint warnings, 0 Node.js dependencies trong runtime pure/edge.
- **Performance:** Xử lý vector mảng liên tục `Float64Array`, ma trận nhỏ giải tích thuần túy không thư viện ngoài.
- **Coverage:** 100% test pass rate và duy trì test coverage khắt khe.

---

## 2. Evaluated Approaches & Pros/Cons

| Phương án | Ưu điểm (Pros) | Nhược điểm (Cons) | Đánh giá |
| :--- | :--- | :--- | :--- |
| **Approach 1: Deep Microstructure & Kyle-Back** | Đo lường chính xác tổn thất lựa chọn đối nghịch (Adverse Selection), co giãn slice linh hoạt theo U-curve. | Thiếu cầu nối với tầng phân bổ vốn và trải nghiệm người dùng trên dashboard. | 7.5/10 |
| **Approach 2: Bayesian Black-Litterman & Orthogonalization** | Chuẩn hóa phân bổ danh mục theo lý thuyết Wall Street, kết nối trực tiếp nhận định AI Agent vào ma trận toán học. | Thiếu tầng bảo vệ khớp lệnh vi mô và công cụ giám sát trực quan. | 8.0/10 |
| **Approach 3: Terminal HUD & Slippage Attribution** | Giám sát vận hành trực quan, minh bạch chi phí trượt giá và rủi ro Greeks. | Thuần UI/Telemetry, không tạo ra alpha mới hay tối ưu hóa thực thi trực tiếp. | 7.0/10 |
| **Approach 4: Toàn diện cả 3 Trụ Cột (Recommended)** | Tạo vòng lặp hoàn chỉnh từ Alpha $\to$ Portfolio $\to$ Microstructure Execution $\to$ Post-Trade Telemetry. | Đòi hỏi thiết kế module chặt chẽ, tuân thủ LOC nghiêm ngặt. | **9.8/10** |

---

## 3. Recommended Solution: Kiến Trúc Triad v12

Tích hợp đồng bộ cả 3 trụ cột vào kiến trúc hệ thống CashClaw:

### Trụ Cột 1: Kyle-Back Microstructure & Adaptive Slicing Engine
- **Module:** `src/tree/quantlib/microstructure/` & `src/tree/execution/oms/`
- **Thành phần:**
  1. `KyleAdverseSelectionEngine`: Tính toán tham số đo lường độ sâu $\lambda_t = \frac{Cov(\Delta P, Q)}{Var(Q)}$ và xác suất giao dịch nội gián (informed order flow).
  2. `AdaptiveVolumeSlicer`: Cắt lệnh theo đường cong khối lượng trong ngày (Intraday U-shape volume distribution), giảm tải lệnh ở vùng thanh khoản mỏng, đẩy mạnh ở thời điểm mở/đóng phiên.
  3. `DynamicCostSorRouter`: Định tuyến đa sàn tối ưu hàm mục tiêu $J = \min \sum (\text{Fee}_i + \text{Impact}_i(\text{Qty}_i))$.

### Trụ Cột 2: Black-Litterman Bayesian Portfolio & Factor Orthogonalization
- **Module:** `src/tree/research/vectorized/` & `src/tree/quantlib/portfolio/`
- **Thành phần:**
  1. `BlackLittermanEngine`: Kết hợp phân bổ cân bằng thị trường (Prior equilibrium $\Pi = \delta \Sigma w_{mkt}$) với ma trận quan điểm $P$, vector quan điểm $Q$, và độ tin cậy $\Omega$ từ `TradingAgents` để tính phân phối hậu nghiệm $\mu_{BL}$ và $\Sigma_{BL}$.
  2. `VectorizedOrthogonalizer`: Thuật toán Gram-Schmidt trên `Float64Array` khử tương quan chéo giữa các factor alpha.
  3. `EqualRiskContributionOptimizer`: Tối ưu hóa phân bổ tỷ trọng danh mục sao cho đóng góp rủi ro của từng tài sản là tương đương.

### Trụ Cột 3: Terminal Waterfall HUD & Slippage Attribution Ledger
- **Module:** `src/components/dashboard/` & `src/tree/execution/attribution/`
- **Thành phần:**
  1. `TerminalWaterfallHud`: UI component hiển thị trực quan 4 tầng Waterfall, tỷ lệ Dark Mesh Netting, trạng thái Urgency Guard và đồng hồ đo Greeks Risk (Delta/Gamma/Vega).
  2. `SlippageAttributionLedger`: Phân rã trượt giá thực tế thành:
     $$\text{Total Slippage} = \text{Half Spread} + \text{Transient Impact} + \text{Permanent Market Drift}$$
  3. `ExecutionTelemetryStore`: Lưu trữ log phân tách lệnh và chi phí trượt giá vào bộ đệm bộ nhớ và D1.

---

## 4. Implementation Considerations & Risks

1. **Giới hạn kích thước file $\le 160$ LOC:**
   - Phân tách riêng biệt giữa interfaces/types và logic implementation.
   - Các thuật toán ma trận (nhân, nghịch đảo $2\times2, 3\times3$) được tách thành helper module riêng.
2. **Nguyên tắc Paper-Only & WebCrypto Invariant:**
   - Giữ nguyên các `@ts-expect-error` và kiểm tra tĩnh cấm gọi API đặt lệnh thật.
   - 100% sử dụng WebCrypto native (`crypto.subtle`), không phụ thuộc thư viện Node.js `crypto`.
3. **Hiệu năng tính toán trên Edge:**
   - Sử dụng `Float64Array` tránh overhead của garbage collection khi tối ưu hóa danh mục và tính toán vi cấu trúc.

---

## 5. Success Metrics & Validation Criteria

- **Unit & Integration Tests:** Đạt 100% pass rate ($\ge 5,470$ tests passing), 0 regressions.
- **E2E Simulation:** Bài test `test/quant/v12-full-suite-simulation.test.ts` chạy trơn tru toàn bộ luồng:
  - Agent Views $\to$ Black-Litterman $\to$ Factor Orthogonalization $\to$ Kyle-Back OMS Waterfall $\to$ Slippage Attribution $\to$ HUD Render.
- **Code Standards:** 0 `:any`, 0 ESLint warnings, 100% semantic CSS tokens, song ngữ Anh-Việt đầy đủ.
- **Production Build:** `npm run build` thành công sạch sẽ.

---

## 6. Next Steps & Dependencies

- Bước tiếp theo: Khởi tạo implementation plan chi tiết theo cấu trúc modular và tiến hành lập trình từng phase tuần tự.
