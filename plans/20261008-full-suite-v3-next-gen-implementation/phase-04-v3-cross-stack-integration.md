# Phase 04: End-to-End Cross-Stack Integration & Global Verification

## Overview
- **Domain:** `test/e2e/full-suite-v3-next-gen.test.ts`
- **Mục tiêu:** Tích hợp kiểm thử liên hoàn toàn bộ chuỗi mắt xích từ L2 Liquidity Shock -> Urgency Guard hạ nhịp TWAP -> Phân bổ SOR -> Tính toán Copula CVaR bảo vệ danh mục -> Giám sát Cockpit UI.

## Key Insights & Requirements
1. **End-to-End Integration Test:**
   - Xây dựng `test/e2e/full-suite-v3-next-gen.test.ts` kiểm định:
     - Dòng giao dịch biến động kích hoạt VPIN Toxic.
     - Microstructure Urgency Guard đổi chế độ TWAP Slicer sang `PASSIVE_POST_ONLY`.
     - Liquidity Void kích hoạt Copula CVaR và cảnh báo Fleet Circuit Breaker.
     - Dữ liệu hiển thị đồng bộ lên hợp đồng dữ liệu của Cockpit UI.
2. **Quality Gates & Invariants:**
   - 100% test coverage trên các file mới.
   - 0 `:any`, 0 ESLint warnings, 0 lint disable comments mới.
   - `npx tsc --noEmit` hoàn thành với 0 lỗi.
   - `npm run build` thành công.
   - Gitleaks scan hoàn toàn sạch sẽ.

## Related Code Files
- `test/e2e/full-suite-v3-next-gen.test.ts` (Tạo mới)
- `docs/development-roadmap.md` & `docs/project-changelog.md` (Cập nhật)

## Todo List
- [ ] Triển khai kịch bản test `test/e2e/full-suite-v3-next-gen.test.ts`
- [ ] Chạy kiểm thử toàn hệ thống `npm test`
- [ ] Chạy kiểm tra kiểu `npx tsc --noEmit` và build `npm run build`
- [ ] Cập nhật tài liệu roadmap và changelog
