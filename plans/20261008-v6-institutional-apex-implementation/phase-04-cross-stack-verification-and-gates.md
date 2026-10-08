# Phase 04: Cross-Stack Integration Test, Quality Gates & Production Build

## Context & Objectives
Xác minh toàn diện chuỗi tích hợp E2E kết nối 3 trụ cột của v6 Institutional Apex OS:
1. `test/e2e/full-suite-v6-institutional-apex.test.ts`:
   - Kết nối: Khớp lệnh vi mô SLR $\to$ Đo lường dòng lệnh độc hại VPIN & Hawkes $\to$ Phân bổ danh mục vĩ mô HRP & Copula Tail Risk.
2. Kiểm tra toàn diện các cổng chất lượng nghiêm ngặt:
   - `npm test`: 100% test suite xanh (dự kiến > 5,340 tests).
   - `npx tsc --noEmit`: 0 compile error.
   - `npm run lint`: 0 ESLint warning.
   - `npm run build`: Production build thành công.
3. Cập nhật tài liệu:
   - `docs/development-roadmap.md`
   - `docs/project-changelog.md`
   - Cập nhật plan `plan.md` sang trạng thái `completed`.

## Todo List
- [ ] Tạo `test/e2e/full-suite-v6-institutional-apex.test.ts` (<= 150 LOC)
- [ ] Chạy kiểm tra E2E test.
- [ ] Chạy `npm test` toàn hệ thống.
- [ ] Chạy `npx tsc --noEmit` & `npm run lint`.
- [ ] Chạy `npm run build`.
- [ ] Đồng bộ tài liệu và bàn giao.
