# Phase 02: High-Performance Stat-Arb Desk: Kalman Filter & OU Cointegration

## Overview
- Priority: High
- Status: Pending
- Objective: Triển khai động bộ lọc Kalman đệ quy (Recursive Online Kalman Filter) xác định hệ số bù trừ động ($\beta_t$) và mô hình hồi quy trung bình Ornstein-Uhlenbeck.

## Architecture & Responsibilities
- `src/tree/quantlib/statarb/kalman-filter-hedge.ts`:
  - Trạng thái ẩn: $[\alpha_t, \beta_t]^T$.
  - Cập nhật đệ quy ma trận hiệp phương sai sai số dự báo $P_t$, Kalman Gain $K_t$.
  - 100% causal, không lookahead.
- `src/tree/quantlib/statarb/ou-cointegration-estimator.ts`:
  - Ước lượng quá trình OU trên spread $y_t - (\alpha_t + \beta_t x_t)$.
  - Tính tốc độ mean-reversion $\theta$, bán rã $t_{1/2} = \ln(2)/\theta$, phương sai cân bằng $\sigma_{eq}^2$.
- `src/tree/quantlib/statarb/statarb-signal-generator.ts`:
  - Tính dynamic z-score và phát tín hiệu `ENTER_LONG_SPREAD`, `ENTER_SHORT_SPREAD`, `EXIT_SPREAD`.

## Implementation Steps
1. Xây dựng toán học thuần túy (pure math functions) cho Kalman Filter.
2. Xây dựng OU estimator & Signal generator.
3. Viết unit tests kiểm thử độ chính xác toán học (convergence, stability, edge cases).

## Success Criteria
- 100% test coverage trên các hàm toán học.
- Files <= 120 LOC, 0 `:any`.
