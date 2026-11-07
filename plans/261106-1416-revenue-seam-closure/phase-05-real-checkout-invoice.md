---
title: "Phase 05 — Real Checkout & Invoice Endpoint"
description: "POST /api/ee/billing/checkout gọi NOWPayments API xuất invoice thật; modal thay setTimeout bằng fetch thật; server tự quyết định tier từ bảng giá thay vì tin payload."
status: done
risk: medium
owner: executor
dependsOn: [phase-04-ipn-secret-fail-closed]
---

# Phase 05 — Real Checkout & Invoice Endpoint

## Context

Hiện `src/components/billing/nowpayments-checkout-modal.tsx:25-27`:

```ts
const handleCreatePayment = () => {
  setLoading(true);
  setTimeout(() => { setLoading(false); setInvoiceCreated(true); onSuccess?.(); }, 600);
};
```

Không gọi mạng. Không `payment_id`, không địa chỉ ví, không QR. Sau đó hiện chữ
*"Send exact payment via NOWPayments IPN"* — bảo khách tự chuyển tiền rồi mong webhook tới.

Và `grep createInvoice|invoice_url|nowpayments.*invoice` trên `src/` → **0**: không tồn tại
bất kỳ endpoint tạo invoice nào.

**Phát hiện quan trọng — trust boundary (mới, chưa có trong tư vấn cũ):**
`NowPaymentsIpnPayloadSchema` (`src/ee/billing/nowpayments-ipn.ts:10-18`) khai báo
`workspace_id` và `target_tier` như thể NOWPayments trả lại chúng. Thực tế NOWPayments
chỉ trả về các field của chính nó (`payment_id`, `payment_status`, `order_id`, `pay_amount`,
`pay_currency`...). `workspace_id` và `target_tier` là **field tự khai trong schema**, không
phải dữ liệu từ nhà cung cấp. Hệ quả: ai gửi IPN có thể tự đặt tier, và
`recordIpnAndUpgradeTier` tin chúng. Test `src/app/api/ee/__tests__/ee-routes.test.ts:42,103`
cũng tự bịa các field này — nên suite xanh không phát hiện ra vấn đề.

**Cách xử lý trong phase này:** server **tự quyết định** `(workspaceId, targetTier)` từ
`order_id` mà chính nó đã tạo lúc tạo invoice. IPN path chỉ dùng `order_id` để tra lại
quyết định đó; không tin `workspace_id`/`target_tier` từ payload nữa.

**Bảng giá đã có** (`SAAS_TIER_ENTITLEMENTS`): BASIC $0, PREMIUM $29, ENTERPRISE $99,
MASTER $299. Không đổi.

## Requirements

1. `POST /api/ee/billing/checkout` nhận `{ targetTier }`, suy ra `workspaceId` từ session
   (phase-03), gọi NOWPayments `POST /v1/invoice`, trả `{ invoiceUrl, paymentId, orderId }`.
2. Server **tự quyết định** `targetTier` từ `SAAS_TIER_ENTITLEMENTS[targetTier].priceUsdMonthly`,
   không nhận giá/amount từ client.
3. Mapping `orderId → (workspaceId, targetTier, expectedAmount)` được ghi nhận phía server
   trước khi redirect, để IPN path tra lại.
4. IPN path suy ra `(workspaceId, targetTier)` từ `order_id`, **không** tin field payload.
5. Modal gọi endpoint thật, hiện `invoiceUrl` + trạng thái chờ xác nhận, không còn `setTimeout`.
6. Secret đọc qua edge binding (`env`), không `process.env`.

## Files

| File | Quyền | Ghi chú |
|---|---|---|
| `src/app/api/ee/billing/checkout/route.ts` | **tạo mới** | Endpoint tạo invoice |
| `src/ee/billing/nowpayments-invoice-client.ts` | **tạo mới** | Wrapper gọi NOWPayments API; đọc key từ `env` |
| `src/ee/billing/checkout-order-store.ts` | **tạo mới** | Mapping `orderId → {workspaceId, targetTier, expectedAmount}` |
| `src/components/billing/nowpayments-checkout-modal.tsx` | sửa | Thay `setTimeout` bằng fetch thật |
| `src/ee/billing/nowpayments-ipn.ts` | sửa | Bỏ tin `workspace_id`/`target_tier` từ payload; suy từ `order_id` |
| `src/app/api/ee/billing/ipn/route.ts` | sửa | Truyền order lookup xuống store |
| `src/app/api/ee/billing/nowpayments-ipn/route.ts` | sửa | Idem |
| `migrations/` | **migration mới** | Bảng `saas_checkout_orders` (hoặc cột trong 0013 — xem bước 3) |

## Steps

1. **Viết `nowpayments-invoice-client.ts`** — một hàm duy nhất gọi
   `POST https://api.nowpayments.io/v1/invoice` với header `x-api-key` lấy từ `env`.
   Trả `{ ok: true, invoiceUrl, invoiceId, orderId }` hoặc `Result` lỗi tường minh.
   Dùng `Result` (`src/lib/result.ts`) cho khớp idiom repo. Không thêm abstraction provider.
2. **Ghi nhận mapping trước khi redirect.** Trước khi trả `invoiceUrl` cho client, ghi
   `{ orderId, workspaceId, targetTier, expectedAmountUsd, createdAtMs }` vào store. Đây là
   điểm then chốt: nếu IPN tới và `orderId` không có trong store, **từ chối** nâng tier —
   không đoán.
3. **Lưu mapping ở đâu.** Khuyến nghị D1 qua migration mới (chứa `workspace_id`,
   `target_tier`, `expected_amount`, `order_id`, `status`, `created_at_ms`), **không**
   in-memory — vì worker isolate của Cloudflare có thể bị recycle và mapping sẽ mất. Nếu
   repo đã có quy ước lưu ở memory cho THỨ khác, giữ trong memory cho `test` nhưng
   production bắt buộc D1. Migration đặt tên theo quy ước repo (`00XX_...sql`); xem lại
   `migrations/` để lấy số tiếp theo sau `0013`.
4. **Sửa `checkout/route.ts`**: validate `targetTier` qua `SaasTierSchema`, từ chối
   `BASIC` (không thể trả tiền cho tier miễn phí), lấy `priceUsdMonthly` từ
   `SAAS_TIER_ENTITLEMENTS` **phía server**, nhúng `workspaceId` vào `order_id`
   (ví dụ `ws:<workspaceId>:<uuid>`), gọi invoice client, trả kết quả.
5. **Sửa IPN path để tra `order_id`.** Trong `nowpayments-ipn.ts`, thay vì đọc
   `data.workspace_id` / `data.target_tier`, tra store bằng `data.order_id`. Nếu không thấy
   hoặc `payment_status` chưa `finished`/`confirmed`, không nâng tier. Giữ `payment_id` cho
   idempotency như hiện tại (`hasProcessedPayment`) — đó là phần đã tốt, đừng đổi.
6. **Sửa modal** (`nowpayments-checkout-modal.tsx:25-27`): thay `handleCreatePayment` bằng
   `fetch('/api/ee/billing/checkout', { method: 'POST', body: JSON.stringify({ targetTier }) })`,
   rồi `window.location.href = invoiceUrl` (NOWPayments hosted checkout). Giữ phần chọn
   currency nếu NOWPayments nhận; nếu không, bỏ và ghi chú. Không thêm state giả.

### Nhánh rẽ: NOWPayments bị từ chối / chưa có API key

Nếu account bị từ chối hoặc key chưa có, **không** giữ modal giả. Làm:

- Checkout route trả lỗi tường minh `503 PAYMENT_PROVIDER_UNAVAILABLE` khi thiếu key.
- Modal hiển thị hướng dẫn liên hệ thanh toán thủ công (email/link), không hiện nút "Pay".
- Tạo invoice thủ công trên dashboard NOWPayments → ghi `payment_id` + `workspaceId` +
  `targetTier` vào D1 bằng tay → IPN vẫn chạy được và tier vẫn đổi.
- Ghi nhận rõ trong report đây là **đường tạm**, không phải trạng thái cuối.

## Validation

```bash
npx vitest run src/app/api/ee src/ee/billing
npm run quality:gate
```

Kiểm chứng sandbox (phase-06 chạy chi tiết; phase này phải đạt):
- `POST /api/ee/billing/checkout` với `{"targetTier":"PREMIUM"` + cookie hợp lệ
  → `{ invoiceUrl: "https://.../invoice/...", paymentId: "...", orderId: "ws:...:..." }`,
  không rỗng.
- Cùng request nhưng `{"targetTier":"BASIC"}` → `400` (tier miễn phí không mua được).
- Cùng request nhưng không có cookie → `401` (trừ khi bạn đã đặt `/api/ee/billing/*` public
  — xem lưu ý dưới).
- Gửi IPN với `target_tier: "MASTER"` nhưng `order_id` trỏ tới một checkout PREMIUM →
  tier phải thành `PREMIUM`, **không** `MASTER`.

**Lưu ý quan trọng về `/api/ee/billing/*` public:** route `checkout` mới nằm dưới
`/api/ee/billing/`, nên nếu bạn exempt cả nhánh này ở phase-03, `checkout` sẽ public. Đó
là **sai** — chỉ hai route IPN (`ipn`, `nowpayments-ipn`) được phép public. Exempt phải
liệt kê **từng route IPN cụ thể**, không phải cả `/api/ee/billing/`. Phase-03 đã ghi chú
này; phase-05 phải kiểm chứng lại bằng case test checkout yêu cầu session.

## Risk & Rollback

**Rủi ro chính — tiếp tục tin payload IPN:** nếu phase này chỉ thêm endpoint mà không sửa
cách IPN suy ra `(workspaceId, targetTier)`, lỗ hổng cũ vẫn nguyên: ai gửi IPN chữ ký hợp
lệ vẫn tự đặt tier. Chữ ký chứng minh *NOWPayments gửi*, không chứng minh *field tự khai là
đúng*. Đây là lý do bước 5 bắt buộc.

**Rủi ro thứ hai:** `order_id` nhúng `workspaceId` kèm UUID — nếu workspaceId chứa ký tự
đặc biệt, cần encode/giới định bảng ký tự. Validate `workspaceId` trước khi nhúng.

**Rollback:** revert phase riêng. Endpoint mới bị xoá, IPN path quay lại hành vi cũ — nên
nếu rollback, **phase-04 (fail-closed) vẫn phải giữ**.

**Cạm bẫy đã biết:** đừng để `checkout` rơi vào nhánh public vì nó cùng prefix
`/api/ee/billing/`. Xem phần Validation ở trên.

## Verified (đo 2026-11-07, sau khi phase-05 xong)

- **Toàn bộ 6 requirements đã đóng trên worker local + D1 local (`cashclaw-db`, đã apply
  đủ `0001`..`0016`):**

  | Requirement | Kiểm chứng thực đo | Trạng thái |
  |---|---|---|
  | 1. `POST /api/ee/billing/checkout` gọi NOWPayments, trả `{ invoiceUrl, paymentId, orderId }` | 18/18 unit test (`src/app/api/ee/billing/checkout/route.test.ts` 9/9 + `src/ee/billing/__tests__/nowpayments-invoice-client.test.ts` 9/9) — endpoint gọi đúng `POST https://api.nowpayments.io/v1/invoice`, nhúng đúng `order_id` đã ghi, và trả đủ 3 field | **PASS (unit)** |
  | 2. Server tự quyết định `targetTier` từ `SAAS_TIER_ENTITLEMENTS[targetTier].priceUsdMonthly` | `curl -s -b "session_id=sess_basic_local" -d '{"targetTier":"PREMIUM","priceAmount":1}' .../checkout` không chịu `priceAmount: 1`; nhánh price lấy `29` của PREMIUM. `BASIC` → `400 UPGRADE_TARGET_INVALID: BASIC is the free tier and cannot be purchased` | **PASS** |
  | 3. Ghi mapping `orderId → (workspaceId, targetTier, expectedAmount)` phía server trước redirect | `migrations/0016_saas_checkout_orders.sql` (25 cột gồm `status`, `payment_id`, `created_at_ms`); `CheckoutOrderStore.recordOrder` ghi D1 + memory trước khi trả `invoiceUrl`; khi thiếu `NOWPAYMENTS_API_KEY` trả `503` và **không** ghi row nào vào D1 | **PASS** |
  | 4. IPN suy `(workspaceId, targetTier)` từ `order_id`, không tin payload | Chữ ký hợp lệ + `order_id` chưa phát hành → `409 IPN_ORDER_UNKNOWN`; đơn `PREMIUM` nhưng body khai `target_tier: "MASTER"`, `workspace_id: "ws_master_local"` → nâng đúng `ws_basic_local` lên `PREMIUM`, `saas_checkout_orders.status = 'PAID'` | **PASS** |
  | 5. Modal gọi endpoint thật, hiện `invoiceUrl` + trạng thái chờ | `grep -n "setTimeout" src/components/billing/nowpayments-checkout-modal.tsx` → **0**; component `fetch('/api/ee/billing/checkout')`, xử lý `503` bằng màn hướng dẫn thanh toán thủ công, không có state giả | **PASS** |
  | 6. Secret đọc qua edge binding (`env`), không `process.env` | `readApiKey()` trong `nowpayments-invoice-client.ts` gọi `getCloudflareContext().env.NOWPAYMENTS_API_KEY` **trước**, chỉ rơi về `process.env` khi không có request context (test/Node thuần) | **PASS** |

- **Nhánh rẽ NOWPayments bị từ chối / chưa có key đã chạy đúng thiết kế:**
  Thiếu `NOWPAYMENTS_API_KEY` trên worker local →
  `503 {"ok":false,"error":"PAYMENT_PROVIDER_UNAVAILABLE: NOWPayments API key is not configured"}`.
  Modal → màn hình hướng dẫn thanh toán thủ công, không hiện nút giả.

- **Lệnh gọi mạng tới `api.nowpayments.io` thật: BLOCKED** chờ user cấp `NOWPAYMENTS_API_KEY`
  qua `npx wrangler secret put NOWPAYMENTS_API_KEY`. Toàn bộ đường tạo invoice (parse response,
  lỗi provider, malformed body, header `x-api-key`) đã được kiểm chứng bằng 18 unit test — chỉ
  còn nhánh mạng thật phụ thuộc key merchant mà plan này không thể tự tạo.

- **Gate phase-05:** `npm run quality:gate` → **exit 0**, **731 test files / 6.129 tests pass**
  (baseline phase-04: 728/6.100; +3 file test, +29 test: `checkout/route.test.ts`,
  `nowpayments-invoice-client.test.ts`, `checkout-order-store.test.ts`). Không `:any`, không
  `console.log`, Knip clean.

- **Lỗ hổng đóng được ở phase này — dẫn chứng:** trước phase-05, `recordIpnAndUpgradeTier` tin
  `data.workspace_id`/`data.target_tier` từ body (field tự khai, NOWPayments không trả lại).
  Đo được sau phase-05: chữ ký hợp lệ + payload khai `"target_tier":"MASTER"` trên đơn hàng
  `PREMIUM` mà server đã phát hành → nâng lên **PREMIUM**, KHÔNG phải MASTER.
