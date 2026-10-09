# Brainstorming Report: v15 Apex Multi-Domain Quantitative & Architecture Suite

**Date:** 2026-10-09  
**Status:** Agreed (Consensus Reached)  
**Selected Approach:** Triad v15 Apex Toàn Diện (Cả 3 trụ cột)

---

## 1. Problem Statement & Requirements
- **Quant Microstructure Gap:** Hệ thống cần đo lường tác động thông tin bất đối xứng (adverse selection) trong dòng lệnh đến để bảo vệ bot Maker trước Informed Traders (Kyle 1985 $\lambda$).
- **Volatility Forecasting Gap:** Biến động tài sản crypto có tính chất "rough" với số mũ Hurst $H < 0.5$ (Gatheral 2018 Rough Volatility), không tuân theo chuyển động Brown chuẩn Markovian. Cần estimator đo lường $H$ cho Greeks hedging & delta adjustments.
- **Codebase Hygiene:** Một số file nguồn cốt lõi (`mock-provider.ts` ~167 LOC, `schemas.ts` ~162 LOC, `shadow-simulator.ts` ~149 LOC) tiệm cận trần 200 LOC, cần phân rã theo SRP xuống $\le 130$ LOC mà không phá vỡ contracts hay tests.

---

## 2. Evaluated Approaches & Trade-offs
1. **Approach 1: Pure Microstructure & OMS**
   - Pros: Cải thiện trực tiếp fill quality và giảm taker fee.
   - Cons: Thiếu mô hình hóa động lực biến động phi Markov cho các chiến lược hedging/options.
2. **Approach 2: Pure Rough Volatility & Regime**
   - Pros: Dự báo rủi ro đuôi và biến động chính xác hơn.
   - Cons: Không giải quyết bài toán chống bị "ăn thịt" do adverse selection ở cấp vi cấu trúc lệnh.
3. **Approach 3: Triad v15 Apex Toàn Diện (Selected)**
   - Pros: Đạt tối ưu hóa đồng thời cả vi cấu trúc (Kyle Lambda), động lực biến động (Rough Volatility Hurst), và tính module hóa clean code $\le 130$ LOC.
   - Cons: Khối lượng công việc cần phối hợp đồng bộ, đòi hỏi kiểm thử liên miền E2E toàn diện.

---

## 3. Recommended Solution: Triad v15 Architecture
- **Pillar 1 — Kyle (1985) Adverse Selection Parameter ($\lambda$) Engine:**
  - $\Delta P_t = \lambda \cdot Q_t + \varepsilon_t, \quad \lambda = \frac{\text{Cov}(\Delta P, Q)}{\text{Var}(Q) + \epsilon}$
  - Tính toán informed order flow share $i = \sqrt{\frac{\lambda}{\sigma_v}}$, phát hiện độc tính dòng lệnh để nới rộng spread hoặc rút quotes.
- **Pillar 2 — Gatheral Rough Volatility Hurst Exponent ($H$) Estimator:**
  - $m(q, \Delta) = \mathbb{E}[|\log \sigma_{t+\Delta} - \log \sigma_t|^q] \propto \Delta^{q \cdot H}$
  - Ước lượng $H$ qua hồi quy log-log giữa biến động log realized volatility trên các độ trễ lag khác nhau, phát hiện regime gồ ghề ($H < 0.5$) so với regime Brownian chuẩn ($H = 0.5$).
- **Pillar 3 — Structural Modularization ($\le 130$ LOC):**
  - Tách `mock-provider.ts` (167 LOC) thành orchestrator mỏng + fixture generators.
  - Tách `shadow-simulator.ts` (149 LOC) thành simulator cốt lõi + fill calculator.
  - Bảo toàn 100% test passing, zero breaking change.

---

## 4. Implementation Considerations & Risks
- **Zero Lookahead:** Không dùng dữ liệu tương lai trong việc tính toán realization lags của Hurst và Kyle Lambda.
- **Paper-Only Invariant:** Tuyệt đối không chạm vào môi trường live trading hay đặt lệnh thực tế (ADR-001).
- **Zero `:any` & Clean Types:** Tất cả interfaces được khai báo nghiêm ngặt trong các file `-types.ts`.

---

## 5. Success Metrics & Validation
- Unit test coverage 100% trên các module toán học mới.
- Suite tích hợp `test/quant/v15-apex-suite-simulation.test.ts` pass 100%.
- Toàn bộ test suite $\ge 5,484$ tests green (zero regressions).
- `npx tsc --noEmit` & `npm run build` clean.
- Mọi file refactored $\le 130$ LOC.
