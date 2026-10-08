# Phase 03: Black Swan Stress Simulator & Copula CVaR Engine

## Overview
- **Domain:** `src/forest/risk/stress/`
- **Mục tiêu:** Xây dựng engine mô phỏng các cú sốc thanh khoản cực đoan và định lượng rủi ro sập đổ đồng thời bằng mô hình Copula đuôi béo và Expected Shortfall (CVaR 99%).

## Key Insights & Requirements
1. **Liquidity Void Simulator (`liquidity-void-simulator.ts`):**
   - Mô phỏng các cú sốc thanh khoản: giãn spread đột ngột ($5\times - 10\times$), hút cạn thanh khoản sổ lệnh ($70\% - 90\%$), và gap giá flash-crash.
2. **Copula Tail Dependence (`copula-tail-dependence.ts`):**
   - Tính toán hệ số phụ thuộc đuôi dưới $\lambda_L$ thông qua Clayton Copula: $\lambda_L = 2^{-1/\theta}$ và Student-t Copula để đo xác suất sập đổ đồng thời giữa các cặp coin.
3. **CVaR Calculator (`cvar-calculator.ts`):**
   - Tính toán Conditional Value at Risk (Expected Shortfall ở mức tin cậy $99\%$) cho danh mục đa chiến lược bot.

## Related Code Files
- `src/forest/risk/stress/stress-types.ts` (Tạo mới)
- `src/forest/risk/stress/liquidity-void-simulator.ts` & test (Tạo mới)
- `src/forest/risk/stress/copula-tail-dependence.ts` & test (Tạo mới)
- `src/forest/risk/stress/cvar-calculator.ts` & test (Tạo mới)

## Todo List
- [ ] Định nghĩa contracts tại `stress-types.ts`
- [ ] Triển khai `liquidity-void-simulator.ts` và unit tests
- [ ] Triển khai `copula-tail-dependence.ts` và unit tests
- [ ] Triển khai `cvar-calculator.ts` và unit tests
