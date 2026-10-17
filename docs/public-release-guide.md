# CashClaw Open-Source Release Guide
## Hướng Dẫn Phát Hành Mã Nguồn Mở CashClaw

---

### 1. Overview / Tổng Quan

- **EN**: CashClaw operates on a dual-license Open-Core model. Community code (under `src/tree/`, `src/land/`, `src/forest/`, `bin/`) is licensed under Apache-2.0. Enterprise & Cloud SaaS modules in `src/ee/` remain proprietary under the CashClaw Commercial License.
- **VI**: CashClaw hoạt động theo mô hình Open-Core 2 tầng bản quyền. Phần mã nguồn cộng đồng (`src/tree/`, `src/land/`, `src/forest/`, `bin/`) dùng giấy phép Apache-2.0. Toàn bộ tính năng mở rộng Doanh nghiệp & Cloud SaaS tại `src/ee/` được bảo vệ độc quyền theo CashClaw Commercial License.

---

### 2. Pre-Release Checklist / Danh Mục Kiểm Tra Trước Khi Phát Hành

1. **Verify Open-Core Isolation**: Run `npx vitest run src/tree/__tests__/open-core-boundary.test.ts` to ensure zero references to `src/ee` in the public codebase.
2. **Package Hygiene Audit**: Run `npx tsx scripts/audit-oss-package.ts` to verify that `.npmignore` excludes proprietary files and secrets (`src/ee/`, `.env`, `.claude/`).
3. **Run Typecheck & Linter**: Ensure `npm run type-check` and `npm run lint` report 0 errors and 0 warnings.
4. **Run Invariant Testing**: Ensure all 3,800+ test suites pass with zero failures.

---

### 3. Packaging & Publishing / Đóng Gói Và Xuất Bản NPM

```bash
# 1. Audit packaging boundaries
npx tsx scripts/audit-oss-package.ts

# 2. Dry-run npm pack to inspect file inclusions
npm pack --dry-run

# 3. Publish public release to npm registry
npm publish --access public
```

---

### 4. Non-Tech CEO Summary / Tóm Tắt Cho Ban Giám Đốc

- **Bảo Vệ Doanh Thu SaaS**: Người dùng mã nguồn mở miễn phí trên GitHub có thể tự chạy Paper Trading bot trên máy tính cá nhân qua CLI. Tuy nhiên, nếu họ muốn chạy 24/7 trên Cloud, nhận tín hiệu Alpha bí mật, hoặc dùng mô hình AI đa tác tử quy mô lớn, họ bắt buộc phải đăng ký gói Cloud SaaS tại cổng thanh toán.
- **An Toàn Tuyệt Đối**: Các file cấu hình nhạy cảm, API keys, và thuật toán độc quyền không bao giờ bị lộ ra ngoài khi phát hành package công khai.
