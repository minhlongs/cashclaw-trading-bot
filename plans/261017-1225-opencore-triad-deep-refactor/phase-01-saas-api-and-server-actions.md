# Phase 1: SaaS API Routes & Server Actions Integration

**Mục tiêu:** Kết nối các module `src/ee/` (RBAC, QuotaGuard, NOWPayments IPN, Local-to-Cloud Sync Bridge) vào Next.js App Router API endpoints và Server Actions.

## Danh sách công việc (Tasks)
- [x] task-01: Tạo API endpoint kiểm tra hạn mức workspace `src/app/api/ee/quotas/route.ts`
- [x] task-02: Tạo API endpoint nhận webhook NOWPayments IPN `src/app/api/ee/billing/ipn/route.ts` với xác thực chữ ký HMAC-SHA512
- [x] task-03: Tạo API endpoint tiếp nhận và xác thực gói đồng bộ Local-to-Cloud `src/app/api/ee/sync/route.ts`
- [x] task-04: Tích hợp `QuotaGuard.assertCanCreateBot` vào `src/app/api/bots/route.ts` để chặn khi vượt giới hạn bot theo gói
- [x] task-05: Viết bộ kiểm thử tích hợp `src/app/api/ee/__tests__/ee-routes.test.ts` đảm bảo 100% tests pass

## Chi tiết kỹ thuật
- Tích hợp Zod validation và Result type (`ok`, `err`).
- Sử dụng Edge-compatible WebCrypto (`crypto.subtle`).
- File size <= 150 LOC per module.
