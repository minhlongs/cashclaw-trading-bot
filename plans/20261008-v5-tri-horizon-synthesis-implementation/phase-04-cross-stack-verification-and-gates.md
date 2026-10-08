# Phase 04: Cross-Stack E2E Verification & Quality Gates

## Overview
- **Priority:** High
- **Status:** Pending
- **Mục tiêu:** Tích hợp kiểm thử đầu-cuối (E2E) kết nối cả 3 trụ cột của v5 Tri-Horizon Synthesis và xác thực toàn bộ các cổng chất lượng (TypeScript, ESLint, Tests, Next.js Build).

## Scope & Workflow
1. **End-to-End Integration Test (`test/e2e/full-suite-v5-tri-horizon.test.ts`):**
   - Kịch bản liên hoàn:
     1. Khởi tạo sổ lệnh đa cặp $\to$ Xây dựng đồ thị tỷ giá $\to$ Thuật toán Bellman-Ford phát hiện chu trình Arbitrage tam giác có lãi sau phí.
     2. Đánh giá chế độ thị trường biến động $\to$ Kích hoạt Thompson Sampling Multi-Armed Bandit để cập nhật trọng số phân bổ vốn thích nghi.
     3. Tính toán Greeks của danh mục vị thế $\to$ Kiểm tra Delta Drift $\to$ Sinh kế hoạch phòng vệ Delta-Neutral Hedging.
2. **Quality Gates:**
   - `npx vitest run test/e2e/full-suite-v5-tri-horizon.test.ts`
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run build`

## Files to Create / Modify
- Create: `test/e2e/full-suite-v5-tri-horizon.test.ts` (<= 150 LOC)
- Update: `plans/20261008-v5-tri-horizon-synthesis-implementation/plan.md` (Update statuses)
- Update: `docs/development-roadmap.md` & `docs/project-changelog.md`

## Success Criteria
- 100% test passing trên toàn bộ dự án (> 5,330+ tests).
- 0 lỗi TypeScript, 0 cảnh báo ESLint, 0 type `:any`.
- Next.js production build hoàn tất thành công.
