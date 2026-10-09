# Phase 4: Full-Suite Integration Simulation & Quality Gate

## Context Links
- Plan: [plan.md](./plan.md)
- Phases: [phase-01](./phase-01-unified-execution-oms-waterfall.md), [phase-02](./phase-02-alpha-lab-vectorized-engine.md), [phase-03](./phase-03-v11-quantitative-desks.md)

## Overview
- Priority: High
- Status: pending
- Target: `test/quant/v11-full-suite-simulation.test.ts`, roadmap, changelog, memory index.

## Requirements
- Viết integration simulation test suite nối liền:
  - Vectorized Alpha Engine sinh tín hiệu phân bổ.
  - Kalman Cointegration & Greeks Hedging định lượng khối lượng đặt lệnh.
  - Unified OMS Waterfall thực thi lệnh từ Dark Mesh nội bộ đến Slicing và SOR.
- Đảm bảo 100% tests toàn dự án (5,436+ tests) vượt qua thành công.
- Cập nhật `docs/development-roadmap.md`, `docs/project-changelog.md` và memory index.

## Related Code Files
- Tạo mới: `test/quant/v11-full-suite-simulation.test.ts` ($\le 130$ LOC)
- Sửa đổi: `docs/development-roadmap.md`, `docs/project-changelog.md`
- Cập nhật Memory Index.

## Success Criteria
- Test E2E simulation chạy pass 100%.
- Next.js build xanh hoàn toàn (`npm run build`).
- 0 lỗi TypeScript (`npx tsc --noEmit`), 0 lỗi ESLint.
