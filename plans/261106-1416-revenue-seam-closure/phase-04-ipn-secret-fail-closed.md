---
title: "Phase 04 — IPN Secret Fail-Closed"
description: "Hợp nhất hai hành vi mâu thuẫn cho cùng một điều kiện: không còn fallback 'test_ipn_secret' trên đường IPN. Thiếu secret phải bị từ chối."
status: done
verified: 2026-11-07
risk: medium
owner: executor
dependsOn: [phase-03-workspace-identity-binding]
---

# Phase 04 — IPN Secret Fail-Closed

## Context

Hai file trong cùng một module có **hai hành vi mâu thuẫn** cho cùng một điều kiện:

- `src/ee/billing/nowpayments-ipn-verifier.ts:63`
  `const secret = ipnSecretOverride ?? process.env.NOWPAYMENTS_IPN_SECRET ?? 'test_ipn_secret';`
  → thiếu env thì **chấp nhận** chữ ký tính bằng chuỗi `'test_ipn_secret'`.
- `src/ee/billing/nowpayments-ipn.ts:65` (`verifyAndProcessNowPaymentsIpn`)
  ```ts
  if (!ipnSecret || ipnSecret.trim().length === 0) {
    return err('IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET');
  }
  ```
  → thiếu secret thì **fail-closed**.

Hai route production (`/api/ee/billing/ipn` qua `verifyNowPaymentsIpnHttpRequest`, và
`/api/ee/billing/nowpayments-ipn`) đều đi qua verifier HTTP — tức là đi đường có fallback.
Nghĩa là trên production, thiếu `NOWPAYMENTS_IPN_SECRET` sẽ chấp nhận chữ ký giả.

Ngoài ra, `.env.example` **không hề** khai báo `NOWPAYMENTS_IPN_SECRET` (đã đọc toàn bộ
file) — nên người deploy không biết biến này bắt buộc. `src/lib/edition/edition-mode.ts:22`
có `NOWPAYMENTS_IPN_SECRET?: string` (optional) — cũng cần hạ về bắt buộc trên đường billing.

**Rà soát toàn repo tìm fallback secret tương tự (đã đo 2026-11-06):**

```bash
grep -rn "|| '[^']*secret'\|?? '[^']*secret'\||| 'test_\|?? 'test_" src/ --include='*.ts' \
  | grep -v '\.test\.ts'
```

Chỉ có **2** kết quả:

| File:line | Fallback |
|---|---|
| `src/ee/billing/nowpayments-ipn-verifier.ts:63` | `'test_ipn_secret'` — **trong phạm vi phase này** |
| `src/app/api/ee/alerts/route.ts:70` | `'default_alert_secret'` — **ngoài phạm vi** |

Lỗi thứ hai (`alerts`) là cùng một lớp lỗ hổng nhưng **không nằm trong 6 requirement đã
xác nhận với user**. Hành vi đúng: **ghi nhận trong report phase-07**, không tự ý mở rộng
phạm vi phase này. Nếu user muốn đóng luôn, đó là một phase riêng cần xác nhận trước.

## Requirements

1. `verifyNowPaymentsIpnHttpRequest` không còn fallback `'test_ipn_secret'`.
2. Thiếu secret → kết quả lỗi tường minh với status `500`/`503`, không bao giờ `ok: true`.
3. `NOWPAYMENTS_IPN_SECRET` được khai báo trong `.env.example`.
4. Trên Cloudflare Workers, secret đọc qua edge binding, không qua `process.env`
   (constraint của phase-05 cũng áp dụng — cùng một chuẩn).

## Files

| File | Quyền | Ghi chú |
|---|---|---|
| `src/ee/billing/nowpayments-ipn-verifier.ts` | sửa | Xoá fallback ở line 63 |
| `src/ee/billing/nowpayments-ipn.ts` | có thể sửa nhỏ | Nếu cần xuất helper lỗi dùng chung (DRY) |
| `src/lib/edition/edition-mode.ts` | sửa | `NOWPAYMENTS_IPN_SECRET?: string` → bắt buộc trên đường billing nếu type cho phép |
| `.env.example` | sửa | Thêm `NOWPAYMENTS_IPN_SECRET` + `NOWPAYMENTS_API_KEY` (không giá trị thật) |
| test của verifier | sửa | Thêm case fail-closed |

## Steps

1. **Xoá fallback.** Trong `nowpayments-ipn-verifier.ts:63`, nếu không có
   `ipnSecretOverride` và không có `NOWPAYMENTS_IPN_SECRET`, trả
   `{ ok: false, status: 500, error: 'IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET' }`.
   Nếu muốn dùng lại chuỗi lỗi của `nowpayments-ipn.ts:65`, xuất nó thành hằng số dùng
   chung (DRY) — **chỉ** nếu cả hai chỗ thật sự cần cùng một chuỗi.
2. **Thêm case test**:
   ```
   it('rejects an IPN request when NOWPAYMENTS_IPN_SECRET is absent', ...)
     // xoá env / override undefined → expect result.ok === false
     // expect status === 500 (hoặc 503 — chọn một giá trị cố định)
     // expect error chứa 'IPN_CONFIG_ERROR'
   ```
   Đây là chốt chặn **fail-closed** — không được làm yếu.
3. **Cập nhật `.env.example`**: thêm
   ```
   # --- Cloudflare Workers secrets (set via `wrangler secret put`) ---
   # NOWPAYMENTS_IPN_SECRET — HMAC-SHA512 secret for IPN webhook verification (REQUIRED in production)
   # NOWPAYMENTS_API_KEY — API key for invoice creation (REQUIRED for checkout)
   ```
   **Không** ghi giá trị thật vào file.

## Validation

```bash
npx vitest run src/ee/billing
npx tsc --noEmit
```

Kiểm chứng hành vi thủ công (local, **không** set secret):
```bash
unset NOWPAYMENTS_IPN_SECRET
curl -si -X POST http://localhost:8787/api/ee/billing/nowpayments-ipn \
  -H 'content-type: application/json' \
  -H 'x-nowpayments-sig: abcd' \
  -d '{"payment_id":"x","payment_status":"finished","order_id":"o","workspace_id":"w","target_tier":"MASTER","pay_amount":299,"pay_currency":"usd"}'
```
Kỳ vọng: HTTP 500/503 và body chứa `IPN_CONFIG_ERROR`. **Không** được là `ok: true`.
Nếu có secret, cùng request đó phải bị `403` do chữ ký sai.

## Risk & Rollback

**Rủi ro:** test cũ của verifier có thể đang dựa vào fallback để chạy không cần set env.
Cần **viết lại** những test đó để seed một secret test tường minh — không làm yếu assertion,
chỉ bỏ sự phụ thuộc vào giá trị mặc định bí mật.

**Rollback:** revert phase riêng lẻ. Không ảnh hưởng phase khác.
