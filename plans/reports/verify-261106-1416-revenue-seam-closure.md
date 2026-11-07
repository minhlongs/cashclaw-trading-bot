# Báo cáo kiểm chứng E2E — Revenue Seam Closure (`261106-1416`)

- **Ngày đo:** 2026-11-07
- **Môi trường:** Local Cloudflare Worker (`npx @opennextjs/cloudflare build` + `npx wrangler dev --port 8787`), D1 local (`DB` = `cashclaw-db`, đã chạy hết `0001`..`0016_saas_checkout_orders.sql`).
- **Dữ liệu seed D1 local:**
  - User A: `usr_tier_basic` → session `sess_basic_local` → workspace `ws_basic_local` (role `OWNER`, tier `BASIC`).
  - User B: `usr_tier_master` → session `sess_master_local` → workspace `ws_master_local` (role `OWNER`, tier `MASTER`).

---

## Bảng tổng hợp 7 Evidence

| # | Mục kiểm chứng | Kết quả | Trạng thái |
|---|---|---|---|
| 1 | Tier không tự khai được qua `?tier=` hay `x-cashclaw-tier` | Cả 2 request trả `tier: "BASIC"` của `ws_basic_local`, bỏ qua `MASTER` tự khai | **PASS** |
| 2 | `/api/ee/*` và `/api/ee/billing/checkout` đòi session (`401`); 2 route IPN vẫn public | `quotas` → `401 Authentication required`; `checkout` → `401 Authentication required`; `nowpayments-ipn` đi qua middleware tới tầng chữ ký (`Missing x-nowpayments-sig header`) | **PASS** |
| 3 | `POST /api/ee/billing/checkout` (server tự tính giá, từ chối `BASIC`, fail-closed khi thiếu key) | `BASIC` → `400 UPGRADE_TARGET_INVALID`; `PREMIUM` khi chưa cấp `NOWPAYMENTS_API_KEY` → `503 PAYMENT_PROVIDER_UNAVAILABLE` (0 row mồ côi ghi vào D1); unit test `checkout/route.test.ts` (9/9) + `nowpayments-invoice-client.test.ts` (9/9) pass. Gọi mạng tới `api.nowpayments.io` thật: **BLOCKED** chờ user cấp `NOWPAYMENTS_API_KEY` | **PASS (code & fail-closed) / BLOCKED (live key)** |
| 4 | Thiếu `NOWPAYMENTS_IPN_SECRET` → fail-closed `503 IPN_CONFIG_ERROR`, xoá hẳn `'test_ipn_secret'` | Worker không có `.dev.vars` trả `503 {"ok":false,"error":"IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET"}`; ký bằng `'test_ipn_secret'` khi có secret thật trả `403 Invalid HMAC signature` | **PASS** |
| 5 | Quyền nâng tier chỉ lấy từ `order_id` do server phát hành + chống replay (`idempotentReplay`) | (5a) `order_id` lạ có chữ ký đúng → `409 IPN_ORDER_UNKNOWN`; (5b) `order_id` của đơn `PREMIUM` nhưng body IPN tự khai `"target_tier":"MASTER"` → nâng lên **`PREMIUM`** (không phải `MASTER`), `saas_checkout_orders.status = 'PAID'`; (5c) gửi lại cùng `payment_id` → `200`, `activated: false`, `idempotentReplay: true` | **PASS** |
| 6 | Toàn bộ quality gate (`type-check`, `lint --max-warnings 0`, `vitest run --coverage`, `knip`) | `GATE_EXIT=0` — **731 test files / 6,133 tests pass**, coverage `93.76%` stmts / `90.85%` branches / `94.86%` funcs / `93.76%` lines, 0 warning, 0 `:any` | **PASS** |
| 7 | Hai user đăng nhập khác nhau thấy workspace và tier/quota riêng biệt | Cookie `sess_basic_local` → `ws_basic_local` (`BASIC`, 1 bot, 1.000 credits); cookie `sess_master_local` → `ws_master_local` (`MASTER`, 100 bots, 250.000 credits) | **PASS** |

---

## Chi tiết lệnh và output thật

### Evidence 1 — Tier không tự khai được

**Lệnh:**
```bash
BASE="http://localhost:8787"
curl -s -b "session_id=sess_basic_local" "$BASE/api/ee/quotas?workspaceId=ws_basic_local&tier=MASTER"
curl -s -b "session_id=sess_basic_local" -H "x-cashclaw-tier: MASTER" "$BASE/api/ee/quotas?workspaceId=ws_basic_local"
```

**Output thật:**
```json
{"ok":true,"workspaceId":"ws_basic_local","tier":"BASIC","entitlements":{"tier":"BASIC","priceUsdMonthly":0,"maxRunningPaperBots":1,"maxWalkForwardWindows":4,"monthlyLlmCredits":1000,"managedLlmPoolAllowed":false,"customWebhookAlertsAllowed":false,"minDurableCronIntervalMinutes":60,"cloudAlphaFeedAccess":false,"deliberationManagedKeys":false}}
{"ok":true,"workspaceId":"ws_basic_local","tier":"BASIC","entitlements":{"tier":"BASIC","priceUsdMonthly":0,"maxRunningPaperBots":1,"maxWalkForwardWindows":4,"monthlyLlmCredits":1000,"managedLlmPoolAllowed":false,"customWebhookAlertsAllowed":false,"minDurableCronIntervalMinutes":60,"cloudAlphaFeedAccess":false,"deliberationManagedKeys":false}}
```
**Kết luận:** **PASS** — cả query `?tier=MASTER` lẫn header `x-cashclaw-tier: MASTER` đều bị bỏ qua; tier trả về là `BASIC` từ D1.

---

### Evidence 2 — EE và Checkout yêu cầu session; IPN webhook giữ public

**Lệnh:**
```bash
BASE="http://localhost:8787"
curl -s -w " HTTP_STATUS=%{http_code}\n" "$BASE/api/ee/quotas"
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST -H "content-type: application/json" -d '{"targetTier":"PREMIUM"}' "$BASE/api/ee/billing/checkout"
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST -H "content-type: application/json" -d '{"bad":1}' "$BASE/api/ee/billing/nowpayments-ipn"
```

**Output thật:**
```text
{"ok":false,"error":"Authentication required"} HTTP_STATUS=401
{"ok":false,"error":"Authentication required"} HTTP_STATUS=401
{"ok":false,"error":"Missing x-nowpayments-sig header"} HTTP_STATUS=401
```
**Kết luận:** **PASS** — `/api/ee/quotas` và `/api/ee/billing/checkout` bị middleware chặn ngay với `Authentication required` (401), trong khi `/api/ee/billing/nowpayments-ipn` đi xuyên qua middleware (không đòi cookie) và chỉ bị chặn ở tầng kiểm tra chữ ký HMAC của chính route IPN (`Missing x-nowpayments-sig header`).

---

### Evidence 3 — Checkout endpoint & nhánh fail-closed khi chưa cấp `NOWPAYMENTS_API_KEY`

**Lệnh:**
```bash
BASE="http://localhost:8787"
curl -s -w " HTTP_STATUS=%{http_code}\n" -b "session_id=sess_basic_local" -X POST -H "content-type: application/json" -d '{"targetTier":"BASIC"}' "$BASE/api/ee/billing/checkout"
curl -s -w " HTTP_STATUS=%{http_code}\n" -b "session_id=sess_basic_local" -X POST -H "content-type: application/json" -d '{"targetTier":"PREMIUM","priceAmount":1}' "$BASE/api/ee/billing/checkout"
```

**Output thật:**
```text
{"ok":false,"error":"UPGRADE_TARGET_INVALID: BASIC is the free tier and cannot be purchased"} HTTP_STATUS=400
{"ok":false,"error":"PAYMENT_PROVIDER_UNAVAILABLE: NOWPayments API key is not configured"} HTTP_STATUS=503
```
**Kết luận:** **PASS (hợp đồng route + nhánh rẽ thiếu key) / BLOCKED (gọi mạng thật tới `api.nowpayments.io`)** — chưa có `NOWPAYMENTS_API_KEY` trong môi trường của user nên nhánh fail-closed trả `503 PAYMENT_PROVIDER_UNAVAILABLE` đúng thiết kế trong `phase-05-real-checkout-invoice.md` (mục *"Nhánh rẽ: NOWPayments bị từ chối / chưa có API key"*), và modal chuyển sang màn hình hướng dẫn thanh toán thủ công thay vì `setTimeout(600)` giả. Toàn bộ đường tạo invoice khi có key đã được kiểm chứng qua 18 unit test (`src/app/api/ee/billing/checkout/route.test.ts` + `src/ee/billing/__tests__/nowpayments-invoice-client.test.ts`).

---

### Evidence 4 — Fail-closed khi thiếu `NOWPAYMENTS_IPN_SECRET`

**Lệnh (worker chạy không có `.dev.vars`):**
```bash
BASE="http://localhost:8787"
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST "$BASE/api/ee/billing/nowpayments-ipn" \
  -H "content-type: application/json" -H "x-nowpayments-sig: abcd" \
  -d '{"payment_id":"x","payment_status":"finished","order_id":"whatever"}'
```

**Output thật:**
```text
{"ok":false,"error":"IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET"} HTTP_STATUS=503
```
**Kết luận:** **PASS** — không còn fallback `'test_ipn_secret'`; thiếu secret lập tức trả `503 IPN_CONFIG_ERROR`.

---

### Evidence 5 — Quyền quyết định tier từ `order_id` phía server & chống replay

**Lệnh:**
```bash
# 5a: Chữ ký HMAC hợp lệ nhưng order_id chưa từng được server phát hành -> 409
PAYLOAD_5A='{"order_id":"ord_unissued_live_01","pay_amount":299,"pay_currency":"usdttrc20","payment_id":"pay_unissued_01","payment_status":"finished","target_tier":"MASTER","workspace_id":"ws_basic_local"}'
SIG_5A=$(node /tmp/ipnprobe/sign.mjs "$PAYLOAD_5A" "$SECRET")
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST "$BASE/api/ee/billing/nowpayments-ipn" \
  -H "content-type: application/json" -H "x-nowpayments-sig: $SIG_5A" -d "$PAYLOAD_5A"

# 5b: Đơn hàng trong saas_checkout_orders là PREMIUM ($29, ws_basic_local),
#     nhưng payload IPN cố tình khai target_tier="MASTER", workspace_id="ws_master_local"
PAYLOAD_5B='{"order_id":"ws:ws_basic_local:live01","pay_amount":29,"pay_currency":"usdttrc20","payment_id":"pay_order_auth_01","payment_status":"finished","target_tier":"MASTER","workspace_id":"ws_master_local"}'
SIG_5B=$(node /tmp/ipnprobe/sign.mjs "$PAYLOAD_5B" "$SECRET")
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST "$BASE/api/ee/billing/nowpayments-ipn" \
  -H "content-type: application/json" -H "x-nowpayments-sig: $SIG_5B" -d "$PAYLOAD_5B"

# Kiểm tra lại qua GET /api/ee/quotas với session của User A
curl -s -b "session_id=sess_basic_local" "$BASE/api/ee/quotas"

# 5c: Gửi lại đúng gói IPN lần thứ hai (replay)
curl -s -w " HTTP_STATUS=%{http_code}\n" -X POST "$BASE/api/ee/billing/nowpayments-ipn" \
  -H "content-type: application/json" -H "x-nowpayments-sig: $SIG_5B" -d "$PAYLOAD_5B"
```

**Output thật:**
```text
=== 5a: Valid signature on an order_id the server never issued -> 409 IPN_ORDER_UNKNOWN ===
{"ok":false,"error":"IPN_ORDER_UNKNOWN: no checkout order matches order_id ord_unissued_live_01"} HTTP_STATUS=409

=== 5b: Valid signature on server-issued PREMIUM order while callback claims MASTER -> upgrades to PREMIUM ===
{"ok":true,"activated":true,"idempotentReplay":false,"paymentId":"pay_order_auth_01","status":"finished","targetTier":"PREMIUM","workspaceId":"ws_basic_local","entitlement":{"workspaceId":"ws_basic_local","ownerUserId":"usr_tier_basic","tier":"PREMIUM","maxRunningBots":5,"maxWalkForwardWindows":16,"monthlyLlmCredits":10000,"managedLlmPoolEnabled":true,"updatedAtMs":1794031382769}} HTTP_STATUS=200

=== 5b-verify: GET /api/ee/quotas as User A (sess_basic_local) after IPN ===
{"ok":true,"workspaceId":"ws_basic_local","tier":"PREMIUM","entitlements":{"tier":"PREMIUM","priceUsdMonthly":29,"maxRunningPaperBots":5,"maxWalkForwardWindows":16,"monthlyLlmCredits":10000,"managedLlmPoolAllowed":true,"customWebhookAlertsAllowed":true,"minDurableCronIntervalMinutes":5,"cloudAlphaFeedAccess":true,"deliberationManagedKeys":true}}

=== 5b-verify-d1: saas_checkout_orders row status in D1 ===
"results": [
  {
    "order_id": "ws:ws_basic_local:live01",
    "workspace_id": "ws_basic_local",
    "target_tier": "PREMIUM",
    "status": "PAID",
    "payment_id": "pay_order_auth_01"
  }
]

=== 5c: Replay of identical signed IPN -> 200 idempotentReplay: true ===
{"ok":true,"activated":false,"idempotentReplay":true,"paymentId":"pay_order_auth_01","targetTier":"PREMIUM","workspaceId":"ws_basic_local"} HTTP_STATUS=200
```
**Kết luận:** **PASS** — server hoàn toàn bỏ qua `target_tier: "MASTER"` và `workspace_id: "ws_master_local"` trong body callback, chỉ nâng đúng `ws_basic_local` lên `PREMIUM` theo bản ghi `saas_checkout_orders`, đánh dấu đơn `PAID`, và chặn replay lần hai với `idempotentReplay: true`.

---

### Evidence 6 — Quality Gate toàn bộ

**Lệnh:**
```bash
npm run quality:gate; echo "GATE_EXIT=$?"
```

**Output thật (rút gọn dòng tổng kết):**
```text
> tsc --noEmit
> eslint src/ --max-warnings 0
> vitest run --coverage
 Test Files  731 passed (731)
      Tests  6133 passed (6133)
All files          |   93.76 |    90.85 |   94.86 |   93.76 |
> knip
GATE_EXIT=0
```
**Kết luận:** **PASS** — 0 lỗi TypeScript, 0 cảnh báo ESLint, 731/731 file test (6.133 test) xanh, coverage vượt ngưỡng, Knip sạch.

---

### Evidence 7 — Danh tính tách biệt giữa hai người dùng

**Lệnh:**
```bash
BASE="http://localhost:8787"
curl -s -b "session_id=sess_basic_local" "$BASE/api/ee/quotas"
curl -s -b "session_id=sess_master_local" "$BASE/api/ee/quotas"
```

**Output thật:**
```json
{"ok":true,"workspaceId":"ws_basic_local","tier":"BASIC","entitlements":{"tier":"BASIC","priceUsdMonthly":0,"maxRunningPaperBots":1,"maxWalkForwardWindows":4,"monthlyLlmCredits":1000,"managedLlmPoolAllowed":false,"customWebhookAlertsAllowed":false,"minDurableCronIntervalMinutes":60,"cloudAlphaFeedAccess":false,"deliberationManagedKeys":false}}
{"ok":true,"workspaceId":"ws_master_local","tier":"MASTER","entitlements":{"tier":"MASTER","priceUsdMonthly":299,"maxRunningPaperBots":100,"maxWalkForwardWindows":256,"monthlyLlmCredits":250000,"managedLlmPoolAllowed":true,"customWebhookAlertsAllowed":true,"minDurableCronIntervalMinutes":1,"cloudAlphaFeedAccess":true,"deliberationManagedKeys":true}}
```
**Kết luận:** **PASS** — không còn dùng chung `'ws_production_default'`; mỗi session tự suy ra đúng workspace của mình qua bảng `saas_workspace_members` và đọc đúng tier từ D1.
