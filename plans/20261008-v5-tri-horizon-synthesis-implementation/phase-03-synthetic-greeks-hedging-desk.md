# Phase 03: Synthetic Greeks & Delta-Neutral Hedging Desk

## Overview
- **Priority:** High
- **Status:** Pending
- **Mục tiêu:** Xây dựng module phân tích độ nhạy rủi ro danh mục qua Black-76 Greeks và tự động đề xuất kế hoạch phòng vệ Delta-neutral (Delta Drift Guard).

## Architecture & Mathematical Specification
1. **Bộ tính toán Closed-form Greeks (`synthetic-greeks-engine.ts`):**
   - Áp dụng mô hình Black-76 cho crypto options/perpetual proxy:
     $$d_1 = \frac{\ln(F/K) + \frac{1}{2}\sigma^2 T}{\sigma \sqrt{T}}, \quad d_2 = d_1 - \sigma \sqrt{T}$$
     $$\Delta_{\text{call}} = e^{-rT} \mathcal{N}(d_1), \quad \Delta_{\text{put}} = -e^{-rT} \mathcal{N}(-d_1)$$
     $$\Gamma = \frac{e^{-rT} \mathcal{N}'(d_1)}{F \sigma \sqrt{T}}$$
     $$\mathcal{V} = F e^{-rT} \mathcal{N}'(d_1) \sqrt{T}$$
     $$\Theta_{\text{call}} = -\frac{F e^{-rT} \mathcal{N}'(d_1)\sigma}{2\sqrt{T}} - r K e^{-rT}\mathcal{N}(d_2) + r F e^{-rT}\mathcal{N}(d_1)$$
2. **Delta-Neutral Auto-Hedger (`delta-neutral-hedger.ts`):**
   - Tổng hợp Net Portfolio Delta: $\Delta_{\text{net}} = \sum_i \Delta_i \times \text{Size}_i$.
   - Khi $|\Delta_{\text{net}}| > \text{Threshold}$ (ví dụ $0.05$ BTC notional), tạo lệnh phòng vệ đối ứng (Hedge Order Plan).

## Files to Create / Modify
- Create: `src/tree/quantlib/greeks/greeks-types.ts` (<= 80 LOC)
- Create: `src/tree/quantlib/greeks/synthetic-greeks-engine.ts` (<= 130 LOC)
- Create: `src/tree/quantlib/greeks/delta-neutral-hedger.ts` (<= 110 LOC)
- Create: `src/tree/quantlib/greeks/greeks.test.ts` (<= 160 LOC)

## Success Criteria
- Giá trị Delta, Gamma, Vega, Theta khớp chính xác với chuẩn tham chiếu Black-Scholes.
- Delta Hedger sinh ra kế hoạch phòng vệ chính xác đưa net delta về 0.
- 100% test coverage trên module `src/tree/quantlib/greeks/`.
