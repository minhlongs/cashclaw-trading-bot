# Brainstorming Report: Kiến Trúc Triad v13 & Tái Cấu Trúc Toàn Diện

**Ngày lập:** 2026-10-09  
**Phiên bản đích:** v13.0.0  
**Trạng thái:** Đồng thuận (Consensus Reached)  
**Tác giả:** Antigravity Pair-Programming Assistant & Quant Architecture Team  

---

## 1. Problem Statement & Mục tiêu

Sau khi ship thành công v12 (Kyle-Back $\lambda$, Bayesian Black-Litterman, Terminal Waterfall HUD), hệ thống CashClaw đứng trước 3 thách thức kỹ thuật và vận hành quan trọng:
1. **Vi cấu trúc độ trễ thấp & Hàng đợi LOB:** Thuật toán khớp lệnh hiện tại thiếu mô hình hóa vị trí hàng đợi (queue position) và xác suất hủy lệnh/khớp lệnh Markovian, dẫn đến ước tính slippage thụ động (passive fill rate) chưa sát thực tế khi thị trường biến động mạnh.
2. **Khép kín vòng lặp Alpha (Reflexive Loop):** Multi-agent debate (`TradingAgents`) xuất ra giả thuyết sang `VectorizedFactorEngine`, nhưng phán quyết kiểm định sống còn (`SurvivalGate`) chưa được truyền ngược tự động (Bayesian feedback) để cập nhật prior belief cho các LLM agents trong các phiên tranh biện tiếp theo.
3. **Nợ kỹ thuật mã nguồn (Fat Files):** Nhiều file lõi đang tiệm cận trần 200 LOC (như `attribution.ts` 198 LOC, `validate-alignment.ts` 192 LOC, `robustness-checks.ts` 185 LOC, `execution-oms-waterfall.ts` 176 LOC), làm giảm tính khả đọc, tăng nguy cơ chạm trần LOC và khó tối ưu hóa bộ nhớ context.

---

## 2. Đánh giá các phương án (Evaluated Approaches)

| Phương án | Ưu điểm | Nhược điểm / Rủi ro | Đánh giá |
|---|---|---|---|
| **A. Chỉ tối ưu LOB Queue & Micro-Price** | Nâng cao độ chính xác khớp lệnh vi mô và slippage simulation. | Không giải quyết được nợ kỹ thuật các file >170 LOC; alpha research vẫn chạy hở vòng lặp. | Thiếu tính toàn diện |
| **B. Chỉ refactor tách file lớn (Fat Files)** | Giảm nợ kỹ thuật ngay lập tức, đưa 100% file về $\le 140$ LOC. | Không mang lại giá trị định lượng (quant alpha) hoặc tính năng mới cho nhà giao dịch. | Thiếu bước tiến kiến trúc |
| **C. Toàn diện v13 Triad (Được chọn)** | Giải quyết đồng bộ cả 3 trục: Vi cấu trúc LOB Markov + Closed-Loop Alpha Deliberation + Tái cấu trúc Fat Files sạch sẽ. | Cần kế hoạch chia phase kiểm thử chặt chẽ để đảm bảo 100% test pass (5,464+ tests). | **Tối ưu nhất (Recommended)** |

---

## 3. Kiến trúc Đề xuất v13 Triad

### Trụ cột 1: Cont-Stoikov LOB Queue Dynamics & Micro-Price Markov Engine
- **Vị trí:** `src/tree/quantlib/microstructure/cont-stoikov-lob-queue.ts` & `src/tree/quantlib/microstructure/cont-stoikov-lob-types.ts`
- **Mô hình toán:**
  - Continuous-time Markov process $q_t$: Ước lượng xác suất khớp lệnh thụ động dựa trên tốc độ hủy lệnh $\mu$, tốc độ lệnh thị trường $\lambda$, và độ sâu hàng đợi $L$:
    $$P(\text{Fill} \mid q, L) = \frac{\lambda}{\lambda + \mu} \cdot \left(1 - \frac{q}{L + 1}\right)$$
  - OFI-Adjusted Micro-Price:
    $$P_{\text{micro}} = P_{\text{mid}} + \frac{Q_b - Q_a}{Q_b + Q_a} \cdot \frac{\text{Spread}}{2}$$
- **Đặc tính:** Thuần túy tính toán, 0 dependency ngoài, tương thích WebCrypto / Cloudflare Workers edge.

### Trụ cột 2: Closed-Loop Reflexive Alpha Deliberation Pipeline
- **Vị trí:** `src/forest/research/tradingagents/deliberation-reflexive-loop.ts` & `src/forest/research/tradingagents/deliberation-reflexive-types.ts`
- **Cơ chế:**
  - Nhận kết quả từ `VectorizedFactorEngine` (IC, IR, Quantile Spread) và `SurvivalGate` (`PAPER_CANDIDATE` / `KILLED`).
  - Cập nhật ma trận niềm tin `AgentBeliefPrior`: Tăng trọng số tự tin cho các feature space đạt Sharpe cao, gắn cờ cấm khai thác (blacklist penalty) cho các pattern bị overfitted.
  - Tích hợp trực tiếp vào vòng lặp debate tiếp theo của `TradingAgents`.

### Trụ cột 3: Structural Refactor & Fat-File Modularization ($\le 140$ LOC)
- **Mục tiêu:** Đưa tất cả các file tiệm cận ngưỡng trần về mức $\le 140$ LOC:
  1. `src/tree/execution/oms/execution-oms-waterfall.ts` (176 LOC) $\rightarrow$ Tách `execution-oms-stages.ts`.
  2. `src/tree/alpha/observability/attribution.ts` (198 LOC) $\rightarrow$ Tách `attribution-metrics.ts`.
  3. `src/tree/alpha/data-quality/validate-alignment.ts` (192 LOC) $\rightarrow$ Tách `validate-alignment-helpers.ts`.
  4. `src/forest/alpha/gate/robustness-checks.ts` (185 LOC) $\rightarrow$ Tách `robustness-check-utils.ts`.
- **Ràng buộc:** Giữ nguyên 100% public export và API backward compatibility, không làm gãy bất kỳ test nào hiện có.

---

## 4. Kế hoạch xác thực & Tiêu chí nghiệm thu (DoD)

1. **Mã nguồn:** Tất cả các file mã nguồn mới và sau tái cấu trúc đều $\le 140$ LOC, 0 `:any`, 0 ESLint warnings.
2. **Kiểm thử:** Viết đầy đủ unit test cho Cont-Stoikov engine, Reflexive loop, và bảo toàn 100% xanh trên toàn bộ 5,464+ test cases hiện tại.
3. **Build:** Next.js production build (`npm run build`) và type-check (`npx tsc --noEmit`) đạt 100% không lỗi.
4. **Nguyên tắc an toàn:** Duy trì bất biến Paper-only invariant (ADR-001) và WebCrypto thuần túy.

---

## 5. Các bước tiếp theo (Next Steps)
- Người dùng xác nhận lập kế hoạch chi tiết (`plan.md` và các phase files trong `./plans/20261009-v13-tri-pillar-architecture-suite/`).
- Triển khai tuần tự theo từng phase độc lập có thể chạy song song.
