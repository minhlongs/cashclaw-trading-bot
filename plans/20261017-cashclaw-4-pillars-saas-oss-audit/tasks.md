# CashClaw 4-Pillar Tasks Checklist

## Phase 1 — Cloud SaaS API Expansion (Pillar 1)
- [x] 1.1 Tạo route `/api/ee/alpha-feed` kết nối `AlphaFeedService` (Tier guard >= PREMIUM)
- [x] 1.2 Tạo route `/api/ee/credits` kết nối `LlmCreditLedger`
- [x] 1.3 Tạo route `/api/ee/alerts` kết nối `CloudAlertDispatcher`
- [x] 1.4 Tạo route `/api/ee/scheduler` kết nối `CloudSchedulerCoordinator`
- [x] 1.5 Tạo route `/api/ee/telemetry` kết nối `ConversionFunnelTracker`
- [x] 1.6 Viết test tự động cho toàn bộ 5 route API mới tạo (`src/app/api/ee/__tests__/expanded-routes.test.ts`)

## Phase 2 — SaaS Dashboard UI & Billing Modal (Pillar 2)
- [x] 2.1 Tạo component `TierComparisonTable` hiển thị 4 tiers (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`)
- [x] 2.2 Tạo component `QuotaUsageCard` hiển thị bot, cron, và credits
- [x] 2.3 Tạo component `NowpaymentsCheckoutModal` hỗ trợ thanh toán crypto
- [x] 2.4 Tạo component `CliSyncBridgeCard` hỗ trợ 1-Click Sync
- [x] 2.5 Tạo trang Billing tổng hợp `src/app/[locale]/(dashboard)/billing/page.tsx`
- [x] 2.6 Viết test tự động cho UI Billing components (`src/components/billing/__tests__/billing-ui.test.tsx`)

## Phase 3 — Public OSS Packaging & Release Pipeline (Pillar 3)
- [x] 3.1 Cấu hình export public package `@cashclaw/quantlib` trong `package.json`
- [x] 3.2 Tạo script kiểm tra build artifact độc lập không rò rỉ mã `src/ee/` (`scripts/audit-oss-package.ts`)
- [x] 3.3 Tạo tài liệu hướng dẫn phát hành `docs/public-release-guide.md`
- [x] 3.4 Viết test kiểm tra tính toàn vẹn của public exports (`src/tree/__tests__/public-export-integrity.test.ts`)

## Phase 4 — Security & Falsification Stress Audit (Pillar 4)
- [x] 4.1 Tạo bộ test audit bảo mật anti-IDOR và chống bypass quota
- [x] 4.2 Tạo bộ test audit chống replay attack trên NOWPayments IPN
- [x] 4.3 Tạo bộ test stress falsification và bảo toàn bất biến ADR-001 Paper-Only
- [x] 4.4 Chạy toàn bộ test suite, typecheck, lint và báo cáo tổng kết
