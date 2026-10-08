# Phase 02: Adaptive Regime & Bayesian MAB Strategy Allocator

## Overview
- **Priority:** High
- **Status:** Pending
- **Mục tiêu:** Xây dựng bộ điều phối vốn thích nghi kết hợp phân loại chế độ thị trường (Markov Volatility Regime) và thuật toán phân bổ Bayesian Multi-Armed Bandit (Thompson Sampling).

## Architecture & Mathematical Specification
1. **Phân loại Chế độ Thị trường (`volatility-regime-detector.ts`):**
   - Phân chia thị trường thành 3 trạng thái:
     - `LOW_VOL_CHOP`: Biến động thấp, phù hợp với chiến lược `grid`.
     - `TRENDING_MOMENTUM`: Biến động trung bình theo xu hướng, phù hợp với `volatility_dca`.
     - `HIGH_VOL_CRISIS`: Biến động cực đoan/toxic flow cao, phù hợp với `mean_reversion` phòng vệ hoặc giảm đòn bẩy.
2. **Thompson Sampling Multi-Armed Bandit (`thompson-sampling-bandit.ts`):**
   - Mỗi cánh tay bandit đại diện cho một chiến lược giao dịch $k$.
   - Tham số hóa phân phối Beta conjugate prior:
     $$\text{Win/Profit: } \alpha_k \leftarrow \alpha_k + \max(0, \text{Sortino}_k)$$
     $$\text{Loss/Drawdown: } \beta_k \leftarrow \beta_k + \max(0, |\text{Drawdown}_k|)$$
   - Lấy mẫu posterior sample $\theta_k \sim \text{Beta}(\alpha_k + 1, \beta_k + 1)$.
   - Chuẩn hóa thành trọng số vốn: $W_k = \theta_k / \sum_j \theta_j$, áp dụng cận dưới khám phá (Exploration Floor $\ge 5\%$).

## Files to Create / Modify
- Create: `src/forest/allocation/bandit/bandit-types.ts` (<= 80 LOC)
- Create: `src/forest/allocation/bandit/volatility-regime-detector.ts` (<= 110 LOC)
- Create: `src/forest/allocation/bandit/thompson-sampling-bandit.ts` (<= 120 LOC)
- Create: `src/forest/allocation/bandit/bandit.test.ts` (<= 150 LOC)

## Success Criteria
- Bộ phân bổ tự động tăng tỷ trọng cho các chiến lược có Sortino dương và giảm tỷ trọng cho chiến lược thua lỗ.
- Duy trì exploration floor tối thiểu 5% để không bao giờ triệt tiêu hoàn toàn một chiến lược hợp lệ.
- 100% test coverage trên các hàm tính toán toán học.
