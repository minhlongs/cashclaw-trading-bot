# Phase 04: Full Cross-Stack Integration & Quality Gates

## Context Links
- Plan: `plans/20261008-tri-pillar-synergy-implementation/plan.md`
- Quality Gates: `vitest.config.ts`, `eslint.config.mjs`, `knip.json`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Tích hợp đầu cuối cả 3 trụ cột vào API endpoints và Dashboard UI, chạy toàn bộ test suite, kiểm tra độ phủ (coverage), kiểm tra kiểu tĩnh (TypeScript) và build OpenNext Cloudflare.

## Architecture & Data Flow
1. Cập nhật Dashboard Client hiển thị trạng thái Arbitrage Monitor và Swarm Activity.
2. Xác minh tính toàn vẹn của D1 read store và anti-IDOR authorization.
3. Chạy `npm test`, `npx tsc --noEmit`, `npm run build`, và kiểm tra knip.

## Related Code Files
- `src/components/dashboard/dashboard-client.tsx` (Modify)
- `src/messages/en.json` & `src/messages/vi.json` (Modify)
- `test/e2e/tri-pillar-integration.test.ts` (Create)

## Success Criteria
- 100% test pass (zero fail).
- Global coverage >= 90% (quantlib 100%).
- `npm run build` thành công, 0 lỗi TypeScript, 0 cảnh báo ESLint.
- Cập nhật tài liệu roadmap & changelog đầy đủ.
