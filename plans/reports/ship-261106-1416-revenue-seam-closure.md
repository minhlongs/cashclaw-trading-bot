# Báo cáo bàn giao & đóng Plan — Revenue Seam Closure (`261106-1416`)

- **Ngày hoàn tất:** 2026-11-07
- **Plan:** `plans/261106-1416-revenue-seam-closure/plan.md` (Phases 01 → 07)
- **Báo cáo kiểm chứng chi tiết:** `plans/reports/verify-261106-1416-revenue-seam-closure.md`

---

## 1. Bảng tổng hợp 7 Evidence (Thực đo trên Worker Local + D1 Local)

| # | Thước đo Done-means | Lệnh kiểm chứng | Kết quả thật | Trạng thái |
|---|---|---|---|---|
| 1 | Tier không tự khai được qua `?tier=` hay `x-cashclaw-tier` | `curl -s -b "session_id=sess_basic_local" "$BASE/api/ee/quotas?workspaceId=ws_basic_local&tier=MASTER"` & `-H "x-cashclaw-tier: MASTER"` | Cả 2 trả `{"ok":true,"workspaceId":"ws_basic_local","tier":"BASIC",...}` — bỏ qua `MASTER` tự khai | **PASS** |
| 2 | `/api/ee/*` và `/api/ee/billing/checkout` đòi session (`401`); 2 route IPN giữ public | `curl` không cookie vào `/api/ee/quotas`, `/api/ee/billing/checkout`, `/api/ee/billing/nowpayments-ipn` | `quotas` → `401 Authentication required`; `checkout` → `401 Authentication required`; `nowpayments-ipn` đi qua middleware tới tầng chữ ký (`Missing x-nowpayments-sig header`) | **PASS** |
| 3 | `POST /api/ee/billing/checkout` tạo invoice thật (server tính giá từ `SAAS_TIER_ENTITLEMENTS`, từ chối `BASIC`, fail-closed khi thiếu key) | `POST /api/ee/billing/checkout` với `BASIC` & `PREMIUM` + 18 unit tests (`checkout/route.test.ts`, `nowpayments-invoice-client.test.ts`) | `BASIC` → `400 UPGRADE_TARGET_INVALID`; `PREMIUM` khi thiếu `NOWPAYMENTS_API_KEY` → `503 PAYMENT_PROVIDER_UNAVAILABLE` (0 row mồ côi ghi vào D1); khi có key (unit test) trả `{ invoiceUrl, paymentId, orderId }` | **PASS (code & fail-closed) / BLOCKED (live key)** |
| 4 | Thiếu `NOWPAYMENTS_IPN_SECRET` → fail-closed `503 IPN_CONFIG_ERROR`, xoá hẳn `'test_ipn_secret'` | `POST /api/ee/billing/nowpayments-ipn` khi worker không có `.dev.vars` | `503 {"ok":false,"error":"IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET"}`; ký bằng `'test_ipn_secret'` khi có secret thật trả `403 Invalid HMAC signature` | **PASS** |
| 5 | Quyền nâng tier chỉ lấy từ `order_id` do server phát hành + chống replay (`idempotentReplay`) | (5a) `order_id` chưa phát hành; (5b) đơn `PREMIUM` nhưng body IPN tự khai `"target_tier":"MASTER"`; (5c) gửi lại cùng `payment_id` | (5a) `409 IPN_ORDER_UNKNOWN`; (5b) `200`, nâng `ws_basic_local` lên **`PREMIUM`** (bỏ qua `MASTER` trong body), `saas_checkout_orders.status = 'PAID'`; (5c) `200`, `activated: false, idempotentReplay: true` | **PASS** |
| 6 | Toàn bộ quality gate xanh (`type-check`, `lint`, `vitest --coverage`, `knip`) | `npm run quality:gate` | `GATE_EXIT=0` — **731 test files / 6,133 tests pass**, coverage `93.76%` stmts / `90.85%` branches / `94.86%` funcs / `93.76%` lines, 0 warning, 0 `:any` | **PASS** |
| 7 | Hai user đăng nhập khác nhau thấy workspace và tier/quota riêng biệt | `GET /api/ee/quotas` với `sess_basic_local` vs `sess_master_local` | User A → `ws_basic_local` (`BASIC`, 1 bot, 1.000 credits); User B → `ws_master_local` (`MASTER`, 100 bots, 250.000 credits) | **PASS** |

---

## 2. Tổng hợp Diff (File sửa đổi & tạo mới)

### File sửa đổi (29 files: `+1,139 / -239` LOC)
- **Bảo mật Middleware & Tenancy:**
  - `src/middleware.ts` (+8/-1), `src/middleware.test.ts` (+32): Bảo vệ `/api/ee/*`, chỉ miễn trừ tường minh `/api/ee/billing/ipn` và `/api/ee/billing/nowpayments-ipn`; giữ `/api/ee/billing/checkout` bắt buộc có session.
  - `src/ee/tenancy/workspace-request-context.ts` (+70/-35): Xoá toàn bộ đường tự khai tier (`?tier=`, `x-cashclaw-tier`, `explicitTier`, `x-cashclaw-active-bots`); suy ra `workspaceId` từ `x-user-id` qua bảng `saas_workspace_members`.
- **IPN Fail-closed & Server Order Authority:**
  - `src/ee/billing/nowpayments-ipn-verifier.ts` (+38/-9), `src/ee/billing/nowpayments-ipn.ts` (+36/-14): Xoá fallback `'test_ipn_secret'`, trả `503 IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET` khi thiếu secret.
  - `src/app/api/ee/billing/ipn/route.ts` (+40/-15), `src/app/api/ee/billing/nowpayments-ipn/route.ts` (+51/-20): Tra cứu `(workspaceId, targetTier)` từ `defaultCheckoutOrderStore.resolveTierDecision(order_id)` thay vì tin `workspace_id`/`target_tier` trong body callback; trả `409 IPN_ORDER_UNKNOWN` nếu `order_id` không do server phát hành; đánh dấu đơn `PAID` sau khi nâng tier.
  - `src/ee/billing/saas-entitlement-store.ts` (+50/-8), `src/ee/billing/saas-entitlement-d1.ts` (+14): Tự phân giải D1 request-scoped qua `createServerClient()` mỗi lần gọi (`resolveDb()`) và đồng bộ `saas_workspace_members` khi nâng tier.
- **Routes & Billing UI:**
  - `src/app/api/ee/alerts/route.ts`, `src/app/api/ee/alpha-feed/route.ts`, `src/app/api/ee/credits/route.ts`, `src/app/api/ee/quotas/route.ts`, `src/app/api/ee/sync/route.ts`, `src/app/api/bots/route.ts`: Đồng bộ với `resolveWorkspaceTierContext` mới.
  - `src/app/[locale]/(dashboard)/billing/page.tsx` (+14/-3), `src/components/billing/use-workspace-billing.ts` (+41/-10), `src/components/billing/nowpayments-checkout-modal.tsx` (+126/-19): Xoá hardcode `'ws_production_default'` và `setTimeout(600)`; gọi `POST /api/ee/billing/checkout` thật và hiển thị màn hình hướng dẫn thanh toán thủ công khi nhận `503 PAYMENT_PROVIDER_UNAVAILABLE`.
  - `.env.example` (+8), `src/lib/edition/edition-mode.ts` (+6): Tài liệu hoá `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NEXT_PUBLIC_APP_URL`.
- **Cập nhật Test Suites hiện có:**
  - `src/app/api/bots/route.test.ts`, `src/app/api/ee/__tests__/ee-routes.test.ts`, `src/app/api/ee/__tests__/expanded-routes.test.ts`, `src/app/api/ee/billing/nowpayments-ipn/route.test.ts`, `src/components/billing/__tests__/billing-ui.test.tsx`, `src/ee/__tests__/runtime-seams-e2e.test.ts`, `src/ee/__tests__/saas-billing-and-sync.test.ts`, `src/ee/__tests__/workspace-request-context.test.ts`, `src/ee/billing/__tests__/nowpayments-anti-replay-audit.test.ts`.

### File tạo mới (14 code/migration/test files: `1,531` LOC)
| File | LOC | Vai trò |
|---|---:|---|
| `migrations/0015_saas_workspace_members.sql` | 25 | Bảng `saas_workspace_members (user_id, workspace_id, role)` + backfill chủ sở hữu khác `'system'` |
| `migrations/0016_saas_checkout_orders.sql` | 30 | Bảng `saas_checkout_orders` lưu quyết định `(order_id, workspace_id, target_tier, expected_amount_usd, status)` |
| `src/ee/tenancy/workspace-membership.ts` | 71 | Tra cứu/khởi tạo workspace mặc định `ws_user_<userId>` cho user đăng nhập |
| `src/ee/billing/nowpayments-ipn-secret.ts` | 29 | Đọc `NOWPAYMENTS_IPN_SECRET` từ Cloudflare edge binding (`getCloudflareContext().env`) trước |
| `src/ee/billing/nowpayments-invoice-client.ts` | 103 | Client gọi `POST https://api.nowpayments.io/v1/invoice` với `x-api-key` từ edge binding |
| `src/ee/billing/checkout-order-d1.ts` | 101 | Truy vấn D1 cho `saas_checkout_orders` |
| `src/ee/billing/checkout-order-store.ts` | 119 | Store quản lý đơn hàng checkout (D1 + memory fallback cho test) |
| `src/app/api/ee/billing/checkout/route.ts` | 106 | Endpoint `POST /api/ee/billing/checkout` (xác thực session, tính giá từ `SAAS_TIER_ENTITLEMENTS`, tạo invoice, lưu order) |
| `src/app/api/ee/billing/checkout/route.test.ts` | 170 | 9 unit tests cho `POST /api/ee/billing/checkout` |
| `src/ee/billing/__tests__/nowpayments-invoice-client.test.ts` | 159 | 9 unit tests cho `createNowPaymentsInvoice` |
| `src/ee/billing/__tests__/checkout-order-store.test.ts` | 220 | Unit tests cho `CheckoutOrderStore` (D1 + memory) |
| `src/ee/billing/__tests__/ipn-secret-fail-closed.test.ts` | 137 | Unit tests chốt hành vi fail-closed `503 IPN_CONFIG_ERROR` |
| `src/ee/billing/__tests__/entitlement-store-d1-binding.test.ts` | 151 | Unit tests cho lazy request-scoped D1 resolution trong `SaasEntitlementStore` |
| `src/ee/tenancy/__tests__/workspace-membership.test.ts` | 110 | Unit tests cho `workspace-membership.ts` |

---

## 3. Success Metrics Đo Được

- **Tier bypass:** `0` lần lọt qua `?tier=`, `x-cashclaw-tier`, body `alerts`, query `credits`, hoặc `x-cashclaw-active-bots` (`grep -rn "explicitTier\|invalidExplicitTier" src/` → `0`).
- **Checkout & Invoice:** Từ chối `BASIC` (`400`), tự lấy giá từ `SAAS_TIER_ENTITLEMENTS` (bỏ qua `priceAmount` do client gửi), fail-closed `503 PAYMENT_PROVIDER_UNAVAILABLE` khi chưa cấp `NOWPAYMENTS_API_KEY` mà không ghi đơn mồ côi vào D1; 18/18 unit tests tạo invoice xanh.
- **Server-side Order Authority & Idempotency:** IPN có chữ ký hợp lệ nhưng `order_id` lạ bị chặn `409 IPN_ORDER_UNKNOWN`; IPN tự khai `MASTER` trên đơn `PREMIUM` chỉ được nâng lên `PREMIUM`; gửi lặp cùng `payment_id` trả `200` với `idempotentReplay: true, activated: false`.
- **Fail-closed IPN Secret:** Worker thiếu `NOWPAYMENTS_IPN_SECRET` trả `503 IPN_CONFIG_ERROR`; chữ ký bằng `'test_ipn_secret'` bị từ chối `403`.
- **Cách ly danh tính:** Hai session khác nhau (`sess_basic_local` vs `sess_master_local`) nhìn thấy hai workspace và hạn mức độc lập (`ws_basic_local` BASIC vs `ws_master_local` MASTER).
- **Quality Gate:** `npm run quality:gate` → `EXIT=0` (**731 test files / 6,133 tests pass**, coverage `93.76%` statements, `0` ESLint warnings, `0` TypeScript errors, `0` `:any`, Knip sạch).

---

## 4. Danh Sách Workspace Mồ Côi (`owner_user_id = 'system'`)

- **Local D1 (`DB` = `cashclaw-db`):**
  ```sql
  SELECT workspace_id, owner_user_id, tier FROM saas_workspace_entitlements WHERE owner_user_id = 'system';
  ```
  Kết quả: **`0` dòng (`results: []`)** sau khi dọn các row thử nghiệm.
- **Remote Production D1 (`--remote`):**
  Kiểm tra read-only trên Cloudflare D1 remote cho thấy bảng `saas_workspace_entitlements` **chưa tồn tại** trên `--remote` (remote D1 hiện mới chỉ chạy tới migration `0012`). Vì chưa có bảng `0013` trên remote nên hiện có **`0` workspace mồ côi** trên production.

---

## 5. Các Blocker Của User & Việc Chưa Thể Làm Tự Động

1. **Cấp `NOWPAYMENTS_API_KEY` và `NOWPAYMENTS_IPN_SECRET` lên Cloudflare Worker:**
   - Do môi trường chưa có `NOWPAYMENTS_API_KEY` thật/sandbox của tài khoản merchant, bước gọi mạng trực tiếp tới `https://api.nowpayments.io/v1/invoice` đang ở trạng thái **BLOCKED chờ key của user** (code đã kiểm chứng nhánh `503 PAYMENT_PROVIDER_UNAVAILABLE` trên worker thật và nhánh `200` qua 18 unit test).
   - Khi có key, chạy:
     ```bash
     npx wrangler secret put NOWPAYMENTS_API_KEY
     npx wrangler secret put NOWPAYMENTS_IPN_SECRET
     ```
2. **Chạy 4 migration D1 còn thiếu trên Production (`--remote`):**
   - Remote D1 (`cashclaw-db`, ID `c054f5a3-e7b9-42f0-88eb-dfffc4f8feae`) hiện mới ở `0012`. Trước khi deploy worker mới lên production, cần chạy tuần tự 4 migration `0013` → `0016` (theo quy tắc an toàn, agent **không** tự ý chạy `--remote` khi chưa có xác nhận):
     ```bash
     npx wrangler d1 execute DB --remote --file=migrations/0013_saas_entitlements.sql
     npx wrangler d1 execute DB --remote --file=migrations/0014_ops_workflow.sql
     npx wrangler d1 execute DB --remote --file=migrations/0015_saas_workspace_members.sql
     npx wrangler d1 execute DB --remote --file=migrations/0016_saas_checkout_orders.sql
     ```
3. **Xác nhận Domain Production (`NEXT_PUBLIC_APP_URL`) cho IPN Callback:**
   - `checkout/route.ts` xây dựng `ipn_callback_url = ${origin}/api/ee/billing/nowpayments-ipn` từ `NEXT_PUBLIC_APP_URL` (hoặc `request.url` origin). Cần đặt `NEXT_PUBLIC_APP_URL` đúng domain public mà NOWPayments gọi vào được.

---

## 6. Ngoài Phạm Vi — Cần User Quyết Định Ở Phase Tiếp Theo

1. **Fallback secret trong `/api/ee/alerts` (`src/app/api/ee/alerts/route.ts:70`):**
   - Đang có `process.env.CASHCLAW_ALERT_SIGNING_SECRET ?? 'default_alert_secret'` — cùng lớp lỗ hổng với `'test_ipn_secret'`. Đã giữ nguyên theo đúng ranh giới 6 requirement của plan này; đề xuất mở một PR nhỏ để fail-closed giống `nowpayments-ipn-secret.ts`.
   - *(Lưu ý: Cửa IDOR ngang khi client truyền `?workspaceId=` / `x-cashclaw-workspace`, kiểm tra thiếu tiền `IPN_AMOUNT_MISMATCH`, bảo vệ `GET /api/ee/billing/nowpayments-ipn`, và tự động tạo workspace cá nhân khi checkout lần đầu đã được đóng ngay trong đợt fix sau Code Review.)*

---

## 7. Dọn Dẹp Branch & Worktree (Phase 07)

- **Đã xoá 1 branch local đã merge:** `baseline/wave10-consolidation` (`5a8d5dd`).
- **Đã xoá 5 branch remote stale đã merge hoàn toàn vào `origin/main` (0 commit ngoài `main`):**
  - `origin/feat/alpha-research-os-phase7` (`12584c64`)
  - `origin/feat/alpha-research-os-phase8` (`50345497`)
  - `origin/feat/alpha-research-os-phase9` (`401cff1e`)
  - `origin/feat/alpha-research-os-phase10` (`57a62821`)
  - `origin/baseline/wave10-consolidation` (`5a8d5ddd`)
- **Giữ nguyên các branch chưa merge / đang có worktree hoạt động:**
  - `origin/feat/cmo-gtm-landing-overhaul` (`88847525`, đang gắn với worktree `/Users/macbook/trade-bot-worktrees/comprehensive-4phase-roadmap` — 1 unmerged commit)
  - `origin/feat/comprehensive-4phase-roadmap` (`dbe977c0` — 1 unmerged commit)
  - `origin/arena/06ec4bf4-cashclaw-trading-bot` (`8453915b` — 42 unmerged commits)
