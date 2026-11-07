---
title: "Phase 03 — Workspace Identity Binding"
description: "Gắn tier với danh tính đăng nhập thật: middleware xác thực /api/ee/* (trừ /api/ee/billing/*), resolver đọc x-user-id server-verified, bỏ ws_production_default hardcode."
status: done
verified: "2026-11-07 — gate exit 0 (727 files / 6088 tests); worker local cho đúng bảng 7 hàng: 401 không cookie, tier A khác tier B, x-user-id giả mạo bị bỏ qua, hai route IPN đi qua middleware, checkout con vẫn 401"
risk: high
owner: executor
dependsOn: [phase-02-tier-authority]
---

# Phase 03 — Workspace Identity Binding

## Context

`src/middleware.ts` đã có phần khung xác thực tốt:

```
line 39  const sessionId = req.cookies.get('session_id')?.value
line 44-46  // strip client-supplied x-user-id rồi set lại từ session D1 đã xác thực
```

Nhưng `PROTECTED_API_PREFIXES` / `SENSITIVE_GET_PREFIXES` (`middleware.ts:12-15`) chỉ chứa
`['/api/bots','/api/settings','/api/alpha']`. `/api/ee` **vắng mặt**, nên các GET EE không
cần session. Và `grep x-user-id workspace-request-context.ts` → **0**: resolver không bao
giờ đọc `x-user-id` mà middleware đã set. Hậu quả: tier không gắn với ai cả.

Hậu quả thứ hai: `src/app/[locale]/(dashboard)/billing/page.tsx:11` hardcode
`const workspaceId = 'ws_production_default'` → mọi khách dùng chung một entitlement.
`GET /api/ee/billing/nowpayments-ipn` cũng có fallback `workspaceId = url.searchParams.get('workspaceId') || 'default'`.

**Phát hiện bổ sung (đã đo 2026-11-06) — requirement 5 chưa có nơi neo, và `owner_user_id` là 'system'.**

Hai lỗ hổng nằm ngay trên đường phase này phải đóng:

| # | Vấn đề | Bằng chứng | Hệ quả |
|---|---|---|---|
| a | **Không có bảng nào đọc được `user_id → workspace_id`** | `cat migrations/0013_saas_entitlements.sql` — chỉ có `saas_workspace_entitlements (workspace_id PK, owner_user_id)` và `saas_nowpayments_ipn_events (payment_id PK)`. Chiều ngược lại (`SELECT workspace_id WHERE owner_user_id = ?`) không truy vấn được ở quy mô D1 và không phân biệt user có nhiều workspace. | Requirement 3 ("workspace suy ra từ session") và Done-means "hai user thấy tier khác nhau" **không thể đạt** nếu không có nguồn ánh xạ. `user.id` từ `/api/auth/me` **chưa phải** workspaceId — hiện chưa ai khai báo quan hệ đó. |
| b | **`owner_user_id` luôn là `'system'`** | `src/ee/billing/saas-entitlement-store.ts:50` → `ownerUserId: record.ownerUserId ?? 'system'`; cả hai route IPN (`ipn/route.ts:38-45`, `nowpayments-ipn/route.ts:47-54`) **không** truyền `ownerUserId`. | Mọi workspace đã nâng tier đều có `owner_user_id = 'system'` → ngay cả có bảng ánh xạ sau này, dữ liệu cũng không dò lại được ai sở hữu. Các migrate cần backfill. |

**Quyết định phase này — ĐÃ CHỐT: phương án B (user chọn 2026-11-06).**
Migration mới `0015_saas_workspace_members (user_id, workspace_id, role)` + backfill
`owner_user_id`. Đúng mô hình đa-tenant; chấp nhận thêm một bảng và một bước backfill so
với phương án A (coi `user_id` = `workspaceId`). Thứ tự bắt buộc: **migration 0015 phải nằm
trước phase-05**, vì phase-05 cần ghi mapping `order_id → workspaceId` và cần biết ai sở hữu.

Cả hai route IPN phải truyền `ownerUserId` (ở phase này lấy tạm từ `workspace_id`, rồi
phase-05 thay bằng lookup `order_id`).

**Quan trọng — không làm vỡ IPN:** hai route `/api/ee/billing/ipn` và
`/api/ee/billing/nowpayments-ipn` phải **vẫn public**, vì NOWPayments gọi chúng không có
session cookie. Nếu blanket-protect `/api/ee/*` bạn mất luôn khách đã trả tiền, và vi phạm
rule protected-flows. **Đây là lỗi dễ mắc nhất của phase này.**

## Requirements

1. `/api/ee/*` (trừ `/api/ee/billing/*`) yêu cầu session hợp lệ cho **cả GET lẫn mutation**.
2. `/api/ee/billing/*` giữ public.
3. Có bảng ánh xạ `user_id → workspace_id` trong D1, và resolver đọc được.
4. `/billing` không còn hardcode `ws_production_default`.
5. Hai user khác nhau thấy tier/quota khác nhau.
6. `owner_user_id` không còn luôn là `'system'` trên các workspace do IPN nâng tier.

## Files

| File | Quyền | Ghi chú |
|---|---|---|
| `src/middleware.ts` | sửa | Thêm prefix + loại trừ billing |
| `src/ee/tenancy/workspace-request-context.ts` | sửa | Đọc `x-user-id`, fallback workspace |
| `src/app/[locale]/(dashboard)/billing/page.tsx` | sửa | Bỏ hardcode, lấy workspace từ session |
| `src/components/billing/use-workspace-billing.ts` | sửa | Nhận workspaceId thay vì nhận từ page hardcode |
| `src/app/api/ee/billing/nowpayments-ipn/route.ts` | sửa | Xoá fallback `'default'` |
| test middleware | tạo mới nếu repo chưa có | Xem bước 8 |
| `migrations/0015_saas_workspace_members.sql` | tạo mới | Xem bước 2 |

## Steps

1. **Thêm `/api/ee` vào cả hai danh sách trong `middleware.ts`**, và thêm một
   `PUBLIC_API_PREFIXES` cho `/api/ee/billing`. Lưu ý thứ tự đánh giá hiện tại trong
   `middleware`: kiểm tra public trước, nên thêm nhánh public `/api/ee/billing` **trước**
   nhánh `needsAuth`. Cách ít xâm lấn nhất: giữ `PUBLIC_API_PREFIXES = ['/api/auth']` và
   thêm `'/api/ee/billing'`, rồi thêm `/api/ee` vào hai danh sách còn lại. Chạy gate để
   chắc chắn thứ tự đúng.
2. **Migration `0015_saas_workspace_members`.** Quy ước repo (đã xác minh): file
   `migrations/00NN_<tên>.sql`, `CREATE TABLE IF NOT EXISTS`, số tiếp theo sau `0014_ops_workflow.sql` là
   `0015`. **Không** cần sửa `.gitignore` — khác Sophia, ở đây `*.sql` **không** bị ignore
   (`git ls-files migrations/` cho thấy 13 file đã được track).
   ```
   CREATE TABLE IF NOT EXISTS saas_workspace_members (
     user_id      TEXT NOT NULL,
     workspace_id TEXT NOT NULL,
     role         TEXT NOT NULL DEFAULT 'OWNER'
                   CHECK (role IN ('OWNER', 'ADMIN', 'TRADER', 'VIEWER')),
     created_at_ms INTEGER NOT NULL,
     PRIMARY KEY (user_id, workspace_id)
   );
   CREATE INDEX IF NOT EXISTS idx_saas_members_user ON saas_workspace_members(user_id);
   ```
   **Cạm bẫy — script apply không có journal:** `scripts/apply-migrations.sh:20-30` chạy
   **mọi** file `.sql` theo thứ tự mỗi lần gọi, không ghi đã apply file nào. Nên `0015` bắt
   buộc idempotent (`IF NOT EXISTS`) và backfill phải an toàn khi chạy lại (xem bước 3).
   `.dev.vars` / D1 local cần `npm run db:apply` (wrangler) hoặc
   `bash scripts/apply-migrations.sh local` — **không** dùng `remote` khi chưa backup.
3. **Backfill `owner_user_id` cho dữ liệu cũ.** Mọi row do IPN nâng tier hiện có
   `owner_user_id = 'system'` (bằng chứng ở Context). Không có dữ liệu nào đủ để dò lại
   chủ sở hữu — nên backfill **không được tự đoán**:
   ```sql
   -- Idempotent: chỉ tạo member cho owner đã biết; KHÔNG tự chọn workspace cho user.
   -- 'system' KHÔNG được promote thành OWNER — nó là giá trị rỗng, không phải chủ sở hữu.
   INSERT OR IGNORE INTO saas_workspace_members (user_id, workspace_id, role, created_at_ms)
   SELECT owner_user_id, workspace_id, 'OWNER', 0
     FROM saas_workspace_entitlements
    WHERE owner_user_id IS NOT NULL AND owner_user_id <> 'system';
   ```
   Các workspace `owner_user_id = 'system'` **không** có member sau bước này. Kết quả: chúng
   không đọc được từ session → chủ sở hữu thật không truy cập được tier mình đã trả tiền
   cho đến khi được neo tay. **Phải ghi danh sách các `workspace_id` như vậy vào report
   phase-07** và để user quyết (đây là dữ liệu thuộc về user, không được tự đoán).
   Chạy lại an toàn vì `INSERT OR IGNORE` + PK `(user_id, workspace_id)`.
4. **Cho resolver đọc `x-user-id` rồi tra bảng members.** `resolveWorkspaceTierContext`
   đọc `req.headers.get('x-user-id')` (middleware set từ D1 session đã xác thực — **không**
   phải giá trị client gửi, vì middleware strip trước khi set). Thứ bậc suy ra `workspaceId`:
   1. `options.explicitWorkspaceId` (từ body/query đã validate ở route) — **giữ**, các route
      CLI/bot vẫn cần chỉ định workspace cụ thể;
   2. `?workspaceId=` / `x-cashclaw-workspace` — **giữ**;
   3. nếu cả hai trống **và** có `x-user-id`: tra `saas_workspace_members` lấy
      `workspace_id`.
   Nếu user có **nhiều** member (người dùng thuộc nhiều workspace): resolver không được
   đoán. Trả ambiguity tường minh cho caller (một field kiểu
   `ambiguousWorkspaceSelection: string[]` trong `WorkspaceTierContext`), và route quyết
   định: `400` yêu cầu chọn workspace, hoặc mặc định lấy OWNER **có created_at_ms cũ nhất**
   — chọn một hành vi, ghi test cho nó. **Không** âm thầm lấy row đầu tiên `SELECT` trả về.
   Nếu `x-user-id` có nhưng **không** có member nào: tier rơi về `'BASIC'` (chưa có quyền
   lợi nào được mua) — đúng, không phải lỗi.
   **Không** ưu ti `x-user-id` của client lên trên giá trị server đã set.
5. **Bỏ hardcode `ws_production_default` ở `billing/page.tsx:11`.** Page lấy
   `/api/auth/me` để biết `user.id`, rồi gọi `/api/ee/quotas` **không** truyền `workspaceId`
   và để resolver tự suy ra (bước 4). Cách này ít state nhất: page chỉ cần biết user đã
   đăng nhập chưa, không cần giữ workspaceId. `use-workspace-billing.ts` làm phần fetch và
   nhận `user.id` làm prop.
   Nếu `user.id` có **nhiều** workspace, page phải có bước chọn workspace (dropdown) —
   không âm thầm lấy một cái.
6. **Sửa `nowpayments-ipn/route.ts`**: xoá `|| 'default'` của GET và tạo member row ở lần
   checkout (phase-05 sẽ làm phần đó — ở phase này chỉ cần xoá fallback). Endpoint này ở
   nhánh public, nhưng `workspaceId = 'default'` vẫn tập trung entitlement nhiều workspace
   vào một chỗ. Trả `400` khi thiếu `workspaceId`.
7. **Truyền `ownerUserId` ở cả hai route IPN.** Hiện cả `ipn/route.ts:38-45` và
   `nowpayments-ipn/route.ts:47-54` gọi `recordIpnAndUpgradeTier` mà không có
   `ownerUserId` → mọi row nâng tier là `owner_user_id = 'system'`
   (`saas-entitlement-store.ts:50`). Ở phase này, lấy `ownerUserId` từ lookup
   `saas_workspace_members` theo `workspaceId`; nếu không tra được, giữ nguyên `'system'`
   (hành vi cũ) và **log** — không đoán. Phase-05 sẽ thay bằng lookup `order_id`.
8. **Test middleware.** Nếu repo chưa có test cho middleware, thêm các case:
   - `/api/ee/quotas` không cookie → `401`.
   - `/api/ee/quotas` cookie hợp lệ → pass, và `x-user-id` trong request đã bị **thay**
     bằng giá trị D1 (chống client spoof).
   - `/api/ee/billing/nowpayments-ipn` POST không cookie → **không** bị 401 (public).
   - `/api/ee/billing/ipn` POST không cookie → **không** bị 401 (public).
   - `/api/ee/checkout` (route mới của phase-05, hoặc bất kỳ route nào dưới
     `/api/ee/billing/` **không** phải hai route IPN) → **phải** 401. Đây là case chốt lỗi
     exempt-theo-prefix: xem phần Validation.

## Validation

```bash
npx vitest run src/app/api/ee src/ee/__tests__ $(ls src/**/middleware*.test.ts 2>/dev/null)
npm run quality:gate
```

Kiểm chứng hành vi (local worker):

| Request | Kỳ vọng |
|---|---|
| `GET /api/ee/quotas` không cookie | `401` |
| `GET /api/ee/quotas` cookie user A | tier của A |
| `GET /api/ee/quotas` cookie user B (khác tier) | tier của B — **khác A** |
| `GET /api/ee/quotas` + header `x-user-id: người_khác` | tier của người trong cookie, **không** phải người trong header |
| `POST /api/ee/billing/nowpayments-ipn` không cookie | **không** `401` (public) |
| `POST /api/ee/billing/ipn` không cookie | **không** `401` (public) |

Dòng thứ 4 là case chống spoof quan trọng nhất — nó chứng minh resolver không dùng giá
trình client tự gửi.

## Risk & Rollback

**Rủi ro chính:** chặn nhầm `/api/ee/billing/*` → mất IPN. Giảm thiểu bằng case test ở
bước 8 và case kiểm chứng hành vi ở trên, **chạy trước khi deploy**.

**Rủi ro thứ hai:** nếu có endpoint EE dùng nội bộ gọi lẫn nhau không qua browser, chúng sẽ
mất dữ liệu nếu middleware chặn cookie. Rà soát:
`grep -rn "fetch('/api/ee\|fetch(\`/api/ee" src/ | grep -v test` để tìm internal caller.
Nếu có internal caller không dùng browser, xử lý bằng cách đưa nó vào public list **có
kiểm soát** (không phải blanket-exempt `/api/ee`).

**Rollback:** revert riêng phase này. An toàn vì chỉ đổi prefix middleware + nguồn
workspaceId.
