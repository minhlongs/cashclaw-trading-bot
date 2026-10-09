# Phase 3: v11 Quantitative & Algorithmic Desk Expansion

## Context Links
- Plan: [plan.md](./plan.md)
- Specs: [docs/brainstorming-v11-refactor-architecture.md](../../docs/brainstorming-v11-refactor-architecture.md)

## Overview
- Priority: High
- Status: pending
- Target: Kalman Cointegration Desk, Transient Market Impact Engine, và Greeks Dynamic Hedging Desk.

## Requirements
- **Kalman Cointegration Desk:**
  - `src/tree/quantlib/kalman/kalman-cointegration-engine.ts`
  - Ước lượng hồi quy động $\beta_t$ và sai số chuẩn qua thuật toán lọc Kalman 1D.
  - Tính toán half-life hồi quy trung bình $t_{1/2} = \ln(2)/\theta$.
- **Transient Market Impact Engine:**
  - `src/tree/quantlib/impact/transient-impact-engine.ts`
  - Mô hình hóa tác động tức thời và hàm suy giảm theo luật lũy thừa (Power-Law Decay).
- **Greeks Dynamic Hedging Desk:**
  - `src/tree/quantlib/hedging/greeks-hedging-desk.ts`
  - Tái cân bằng rủi ro Delta, Gamma, Vega với chi phí trượt giá tối thiểu.

## Related Code Files
- Tạo mới: `src/tree/quantlib/kalman/kalman-cointegration-types.ts`, `kalman-cointegration-engine.ts`, `.test.ts`, `index.ts`
- Tạo mới: `src/tree/quantlib/impact/transient-impact-types.ts`, `transient-impact-engine.ts`, `.test.ts`, `index.ts`
- Tạo mới: `src/tree/quantlib/hedging/greeks-hedging-types.ts`, `greeks-hedging-desk.ts`, `.test.ts`, `index.ts`

## Success Criteria
- 100% test coverage trên cả 3 engine định lượng mới.
- 0 `:any`, 0 `console.log`.
