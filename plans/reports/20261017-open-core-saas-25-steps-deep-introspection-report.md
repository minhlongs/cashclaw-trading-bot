# Deep Brainstorm Report: 25-Step Open-Core Public GitHub & Cloud SaaS Hardening (`--deep`)

- **Date:** 2026-10-17
- **Project:** CashClaw Trading Bot Platform (`/Users/macbook/trade-bot`)
- **Flow:** `/ak-bootstrap` → `/ak-brainstorm --deep`
- **Target:** 25-Step Open-Core Public GitHub (Apache-2.0) + Recurring Cloud SaaS (`src/ee/`)

---

## 1. Opening Brainstorm Contract

### Outcome (Kết quả mục tiêu)
- Vận hành hoàn chỉnh kiến trúc **Open-Core 25 bước** cho phép phát hành công khai mã nguồn lõi (`src/tree/`, `src/land/`, `@cashclaw/quantlib`, `@cashclaw/alpha-zoo`, CLI `bin/cashclaw.js`) dưới giấy phép **Apache-2.0** trên GitHub Public, đồng thời khóa chặt **hào kinh tế Cloud SaaS (`src/ee/`)** thu phí định kỳ (`BASIC $0` / `PREMIUM $29` / `ENTERPRISE $99` / `MASTER $299`) qua NOWPayments IPN & Cloudflare Workers/D1.
- Khép kín **5 khoảng trống thực thi (Execution Seam Gaps)** được phát hiện qua kiểm tra mã nguồn sâu (`--deep`) giữa tầng catalog `src/ee/` và runtime thực tế (D1 persistence, bot creation quota count, cron lease wiring, Cloud Alpha API route, và Git status untracked hygiene).

### Constraints (Ràng buộc bất biến)
1. **ADR-001 Safety Invariant:** 100% `PAPER/BACKTEST ONLY` — tuyệt đối không phát sinh lệnh giao dịch tiền thật.
2. **Zero-Leak Boundary:** `src/tree/**` không được phép import bất kỳ module nào từ `src/ee/**` (bảo vệ bởi `src/tree/__tests__/open-core-boundary.test.ts`).
3. **Code Quality Standards:** 0 `:any`, mọi file code `< 200 LOC`, 0 `console.log` trong `src/`, 0 `eslint-disable` mới, giữ nguyên toàn bộ test suite đang xanh.
4. **Payment Rule:** Chỉ sử dụng **NOWPayments IPN** (HMAC-SHA512 + anti-replay) cho nâng cấp tier tự động; tuyệt đối không dùng Polar.
5. **Bilingual Docs & UI:** Hỗ trợ song ngữ Việt - Anh (`vi` / `en`).

### Non-Goals (Không nằm trong phạm vi)
1. Không tách thành nhiều git repository vật lý riêng biệt ở giai đoạn này (giữ cấu trúc Monorepo Open-Core: Apache-2.0 Core + Commercial `src/ee/`).
2. Không tích hợp giao dịch live hoặc lưu ký ví tiền mã hóa của người dùng.
3. Không thay đổi các luồng bảo vệ (Setup Wizard, Telegram Bot, NOWPayments IPN contract hiện hành).

### Acceptance Criteria (Tiêu chí nghiệm thu quan sát được)
1. **D1-Backed SaaS Entitlements & Anti-Replay Store:** `POST /api/ee/billing/nowpayments-ipn` và `GET/POST /api/ee/credits` hỗ trợ lưu trữ/đọc trạng thái từ bảng D1 `saas_workspace_entitlements` & `saas_nowpayments_ipn_events` (migration `0013`) với fallback in-memory an toàn khi chạy test/local.
2. **Real Active Bot Count in Quota Guard:** `POST /api/bots` (`src/app/api/bots/route.ts:73`) truy vấn số lượng bot thực tế của tenant từ `BotManager` thay vì hardcode `const currentBotCount = 0`.
3. **Cloud Alpha Feed & Alert API Exposure:** Thêm endpoint `GET /api/ee/alpha-feed` (Step 14) và `POST /api/ee/alerts/dispatch` (Step 15) có kiểm tra `SaasTier` để kết nối các module `src/ee/alpha-cloud/` và `src/ee/alerts/` ra HTTP surface.
4. **Durable Cron Lease Integration:** `src/worker-cron.ts` tích hợp `CloudSchedulerCoordinator` (Step 12) để chống double-tick giữa các Cloudflare Worker isolates.
5. **100% Verification:** `npx cashclaw steps` đạt `25/25`, `npm test` và `npm run build` pass 100% với 0 lỗi TypeScript/ESLint.

---

## 2. Deep Codebase Introspection Findings (`--deep` Evidence Audit)

Qua kiểm tra trực tiếp mã nguồn tại `/Users/macbook/trade-bot`, 25 bước trong `src/ee/catalog/open-core-25-steps-catalog.ts` và `.mekong/company.json` đã có đầy đủ 25 file artifact nền tảng, nhưng có **5 điểm nối (runtime seams)** đang dừng ở mức in-memory hoặc stub:

| # | Vị trí phát hiện (`file:line`) | Hiện trạng trong Codebase | Rủi ro nếu không đóng kín |
|---|---|---|---|
| **G1** | `src/app/api/bots/route.ts:73` | `const currentBotCount = 0;` đang được hardcode trước khi gọi `enforceWorkspaceQuota()`. | Người dùng gói `BASIC` (giới hạn 1 bot) vẫn có thể gọi `POST /api/bots` tạo vô hạn bot vì `activeRunningBots` luôn bằng `0`. |
| **G2** | `src/app/api/ee/billing/nowpayments-ipn/route.ts:9` | `const processedPayments = new Set<string>()` chỉ lưu trong RAM của isolate; chưa ghi vào bảng `saas_nowpayments_ipn_events` và chưa nâng cấp `tier` trong bảng `saas_workspace_entitlements` (`migrations/0013_saas_entitlements.sql`). | Khi Cloudflare Worker recycle isolate, trạng thái thanh toán và nâng cấp gói `PREMIUM`/`ENTERPRISE`/`MASTER` bị mất hoặc có thể bị replay. |
| **G3** | `src/app/api/ee/sync/route.ts:10` | `verifyAndImportCloudSyncBundle()` chỉ xác thực chữ ký SHA-256 và trả về JSON, chưa đăng ký bot vào `BotManager` hoặc kiểm tra hạn mức `enforceWorkspaceQuota()`. | Luồng PLG `npx cashclaw export-sync` → Cloud SaaS chưa thực sự khởi tạo bot trên Cloud sau khi import. |
| **G4** | `src/ee/alpha-cloud/alpha-feed-service.ts` & `src/ee/alerts/cloud-alert-dispatcher.ts` | Hai module Step 14 và Step 15 đã có unit test nhưng chưa có route HTTP dưới `src/app/api/ee/alpha-feed/route.ts` và `src/app/api/ee/alerts/route.ts`. | Người dùng trả phí trên UI Dashboard chưa thể gọi API lấy tín hiệu Curated Alpha IC/IR hoặc gửi cảnh báo HMAC Webhook. |
| **G5** | `src/worker-cron.ts:14` | `scheduled()` gọi thẳng `manager.drainQueues()` mà chưa đi qua `CloudSchedulerCoordinator.acquireTickLease()` (`src/ee/scheduler/cloud-scheduler-coordinator.ts`). | Nhiều Worker isolates có thể chạy trùng cron tick trong cùng một phút epoch. |

---

## 3. Option Exploration & Architectural Trade-offs

| Phương án | Mô tả | Ưu điểm | Nhược điểm | Khuyến nghị |
|---|---|---|---|---|
| **Option 1: Runtime Seam Closure across the 25-Step Monorepo (Khuyến nghị)** | Giữ nguyên cấu trúc 25 bước đã chuẩn hóa trong `src/ee/`; đóng kín cả 5 khoảng trống G1–G5 bằng cách nối `BotManager`, D1 store (`0013`), `CloudSchedulerCoordinator`, và 2 API routes (`alpha-feed`, `alerts`) với file `< 200 LOC`. | Chuyển hóa toàn bộ 25 bước từ "catalog/module-level" thành "end-to-end production SaaS"; không phá vỡ bất kỳ test hiện có nào; tuân thủ tuyệt đối YAGNI/KISS. | Cần viết thêm adapter D1 nhẹ cho entitlements/IPN. | **CHỌN (RECOMMENDED)** |
| **Option 2: Multi-Package Workspace Split (`packages/oss` + `packages/ee`)** | Chuyển đổi toàn bộ repo sang pnpm/npm workspaces với nhiều `package.json` con. | Tách bạch vật lý khi publish npm. | Đập lại toàn bộ đường dẫn `@/` trong 300+ file test, rủi ro gãy build Cloudflare Workers cao. | Loại bỏ (Vi phạm KISS & Small Diffs) |
| **Option 3: Documentation-Only Audit** | Chỉ cập nhật tài liệu hướng dẫn mà không sửa các điểm nối runtime G1–G5. | Nhanh, không đụng vào code. | Để lọt lỗ hổng `currentBotCount = 0` và mất trạng thái thanh toán khi Worker khởi động lại. | Loại bỏ (Vi phạm nguyên tắc "implement real code, not simulation") |

---

## 4. Handoff Contract for `/ak:plan` & `/ak:cook`

Khi chuyển sang bước lập kế hoạch (`/ak:plan`) và thực thi (`/ak:cook`), kế hoạch sẽ gồm **4 Phase nhỏ gọn**:
1. **Phase 1 — Quota & Sync Runtime Wiring (G1 + G3):**
   - Nối `src/app/api/bots/route.ts` với `getBotManager().getAllBots()` để đếm đúng số bot hiện tại của tenant trước khi gọi `enforceWorkspaceQuota()`.
   - Nối `src/app/api/ee/sync/route.ts` với `enforceWorkspaceQuota()` để kiểm tra quota khi import bundle từ CLI.
2. **Phase 2 — D1 Persistence Store for SaaS Entitlements & NOWPayments IPN (G2):**
   - Tạo `src/ee/billing/saas-entitlement-store.ts` (`< 150 LOC`) đọc/ghi bảng `saas_workspace_entitlements` & `saas_nowpayments_ipn_events` (với fallback in-memory cho môi trường không gắn D1).
   - Cập nhật `src/app/api/ee/billing/nowpayments-ipn/route.ts` sử dụng store này.
3. **Phase 3 — Cloud Alpha Feed & Signed Alert API Routes + Cron Lease Guard (G4 + G5):**
   - Tạo `src/app/api/ee/alpha-feed/route.ts` (Step 14) và `src/app/api/ee/alerts/route.ts` (Step 15).
   - Tích hợp `CloudSchedulerCoordinator` vào `src/worker-cron.ts` (Step 12).
4. **Phase 4 — End-to-End Integration Tests & OSS Boundary Audit:**
   - Viết test kiểm chứng quota chặn đúng từ bot thứ 2 ở gói `BASIC`, IPN nâng cấp gói lên `PREMIUM` mở khóa 5 bots + Alpha Feed, và chạy `npm test` + `scripts/audit-oss-boundary.sh`.
