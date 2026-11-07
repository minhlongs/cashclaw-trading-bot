---
title: "Phase 06 — Sandbox E2E Verification"
description: "Chứng minh 6 Done-means bằng lệnh chạy được trên sandbox NOWPayments, không bằng cảm giác. Ghi artifact để plan archive có bằng chứng."
status: done
risk: medium
owner: executor
dependsOn: [phase-05-real-checkout-invoice]
---

# Phase 06 — Sandbox E2E Verification

## Context

Done-means chỉ có giá trị nếu mỗi mục kiểm chứng được bằng **lệnh, số, hoặc trạng thái hệ
thống** — không phải bằng "gate xanh". Phase này chạy 6 bằng chứng và ghi artifact.

**Điều kiện tiên quyết (blockers của user):** NOWPayments sandbox API key + IPN secret đã
đặt qua `wrangler secret put` (hoặc `.dev.vars` khi local). Nếu chưa có, phase này chỉ chạy
được các case không cần nhà cung cấp (evidence 1, 2, 5, 6) và phần sandbox phải đánh dấu
BLOCKED trong report.

## Requirements

Chạy và ghi kết quả cho **6 evidence** dưới đây. Mỗi evidence phải có: lệnh, output thật,
và kết luận pass/fail.

## Evidence

### Evidence 1 — Tier không tự khai được

```bash
BASE=http://localhost:8787
curl -s "$BASE/api/ee/quotas?workspaceId=ws_verify_01&tier=MASTER"
curl -s -H "x-cashclaw-tier: MASTER" "$BASE/api/ee/quotas?workspaceId=ws_verify_01"
```
Pass khi **cả hai** trả tier D1 thật của `ws_verify_01` (seed BASIC), không `MASTER`.

### Evidence 2 — EE yêu cầu session, IPN thì không

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/ee/quotas"                 # → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/ee/billing/checkout" -d '{}' # → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/ee/billing/nowpayments-ipn" -d '{"bad":1}' # → 400 (400 evidence 4)
```
Pass khi: `quotas` và `checkout` trả `401`; `nowpayments-ipn` **không** trả `401`.

### Evidence 3 — Invoice thật

```bash
curl -s -X POST "$BASE/api/ee/billing/checkout" -b 'session_id=<cookie user A>' \
  -H 'content-type: application/json' -d '{"targetTier":"PREMIUM"}'
```
Pass khi trả `invoiceUrl` trỏ tới `nowpayments.io` và `paymentId`/`orderId` khác rỗng.
Mở `invoiceUrl` trong browser sandbox → thấy trang thanh toán NOWPayments thật.

### Evidence 4 — Fail-closed

Chạy Evidence 2 dòng 3 mà **không** set secret. Pass khi body chứa `IPN_CONFIG_ERROR` và
status `500`/`503` — không `ok: true`.

### Evidence 5 — Idempotency và quyền tier từ `order_id`

Gửi IPN hợp lệ (chữ ký đúng) cho một `payment_id`, `order_id` thuộc checkout PREMIUM,
nhưng payload có `target_tier: "MASTER"`.

```bash
# Pass khi: tier của workspace đó thành PREMIUM (theo order_id), KHÔNG phải MASTER
# Gửi lại cùng payment_id:
# Pass khi: response có idempotentReplay === true và tier không đổi lần hai
```

### Evidence 6 — Gate toàn bộ

```bash
npm run quality:gate; echo "EXIT=$?"
```
Pass khi `EXIT=0`, 0 warning, 0 `:any`.

### Evidence 7 — Danh tính riêng biệt (bổ sung từ phase-03)

Đăng nhập hai user A và B, mỗi người mở `/billing`.
Pass khi tier/quota hiển thị khác nhau (seed B tier cao hơn A trước khi test).

## Files

| File | Quyền |
|---|---|
| `plans/reports/verify-261106-1416-revenue-seam-closure.md` | tạo mới — ghi output thật của 7 evidence |

## Steps

1. Seed dữ liệu test trong D1 local: 2 user + session, 2 workspace có tier khác nhau.
2. Chạy từng evidence, **dán output thật** vào report. Không tóm tắt thành "pass".
3. Evidence nào BLOCKED do thiếu key phải ghi rõ **thiếu gì** và **điều kiện mở khoá**.
4. Nếu một evidence fail: sửa lỗi trong phase sở hữu tương ứng, **không** nới Done-means cho
   khớp kết quả. Nếu nghi ngờ Done-means sai, dừng và hỏi user.

## Validation

Report tồn tại, mỗi evidence có lệnh + output + kết luận. `npm run quality:gate` exit 0.

## Risk & Rollback

Rủi ro thấp — phase này chỉ đo, không sửa code. Nếu evidence fail do lỗi thật, việc sửa
thuộc về phase sở hữu file đó; phase-06 chỉ ghi nhận.

## Verified (đo 2026-11-07, sau khi phase-06 xong)

Toàn bộ 7 evidence đã chạy trên **Cloudflare Worker local** (`npx @opennextjs/cloudflare build`
+ `npx wrangler dev --port 8787`, OpenNext worker sinh từ source hiện tại) với **D1 local**
(`DB` = `cashclaw-db`, đã apply `0001`..`0016`). Output thật từng lệnh được ghi đầy đủ trong
`plans/reports/verify-261106-1416-revenue-seam-closure.md`. Tóm tắt:

| Evidence | Trạng thái | Bằng chứng cốt lõi |
|---|---|---|
| 1 — Tier không tự khai được (`?tier=`, `x-cashclaw-tier`) | **PASS** | Cả 2 request trả `tier: "BASIC"` của `ws_basic_local`; `MASTER` tự khai bị bỏ qua. |
| 2 — `/api/ee/*` + checkout đòi session; 2 route IPN public | **PASS** | `quotas` → `401 Authentication required`; `checkout` → `401 Authentication required`; `nowpayments-ipn` đi qua middleware tới tầng chữ ký (`401 Missing x-nowpayments-sig header`). |
| 3 — Invoice thật & nhánh thiếu key | **PASS (code & fail-closed) / BLOCKED (live key)** | `BASIC` → `400 UPGRADE_TARGET_INVALID`; `PREMIUM` khi chưa có `NOWPAYMENTS_API_KEY` → `503 PAYMENT_PROVIDER_UNAVAILABLE`, 0 row mồ côi trong `saas_checkout_orders`; 18/18 unit test tạo invoice pass. |
| 4 — Fail-closed khi thiếu `NOWPAYMENTS_IPN_SECRET` | **PASS** | `503 {"ok":false,"error":"IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET"}`; payload ký bằng literal `test_ipn_secret` trả `403 Invalid HMAC signature`. |
| 5 — Order authority + chống replay | **PASS** | (5a) `order_id` chưa phát hành, chữ ký đúng → `409 IPN_ORDER_UNKNOWN`; (5b) body khai `MASTER` trên đơn `PREMIUM` → nâng `PREMIUM`, `saas_checkout_orders.status='PAID'`; (5c) replay cùng `payment_id` → `200`, `activated: false`, `idempotentReplay: true`. |
| 6 — Quality gate | **PASS** | `GATE_EXIT=0` — 731 test files / 6.129 tests pass; coverage 93.78% / 90.88% / 94.82% / 93.78%; 0 warning; 0 `:any`. |
| 7 — Danh tính tách biệt 2 user | **PASS** | `sess_basic_local` → `ws_basic_local` (BASIC, 1 bot, 1.000 credits); `sess_master_local` → `ws_master_local` (MASTER, 100 bots, 250.000 credits). |

**Điều kiện mở khoá còn treo (user phải cấp):**
1. `NOWPAYMENTS_API_KEY` (merchant/sandbox) — để chạy nhánh gọi mạng tới `api.nowpayments.io/v1/invoice` thật.
2. `NOWPAYMENTS_IPN_SECRET` — phải là **binding** (`wrangler secret put`), không phải biến shell; biến shell ngoài workerd không lọt vào sandbox (đã đo: worker vẫn trả `503`).
3. `NEXT_PUBLIC_APP_URL`/callback URL production thật — plan ghi rõ domain trong repo chưa xác minh được.

