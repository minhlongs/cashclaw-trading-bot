# Phase 01 — Alert Webhook Signing Secret Fail-Closed & Edge Binding

## Context
`src/app/api/ee/alerts/route.ts:66` currently falls back to `'default_alert_secret'` when `parsed.data.signingSecret` and `process.env.CASHCLAW_ALERT_WEBHOOK_SECRET` are absent, and does not read from Cloudflare Workers edge bindings (`getCloudflareContext().env`).

## Files to Create / Modify
- **Create:** `src/ee/alerts/alert-webhook-secret.ts` (<= 50 LOC)
  - Export `ALERT_MISSING_SECRET_ERROR = 'ALERT_CONFIG_ERROR: Missing CASHCLAW_ALERT_WEBHOOK_SECRET'`.
  - Export `readAlertWebhookSecret(explicitSecret?: string): string | null`:
    1. If `explicitSecret && explicitSecret.trim().length > 0`, return `explicitSecret.trim()`.
    2. Try `getCloudflareContext().env` for `CASHCLAW_ALERT_WEBHOOK_SECRET` or `CASHCLAW_ALERT_SIGNING_SECRET`.
    3. Fallback to `process.env.CASHCLAW_ALERT_WEBHOOK_SECRET` or `process.env.CASHCLAW_ALERT_SIGNING_SECRET`.
    4. Return `null` when none is configured.
- **Modify:** `src/app/api/ee/alerts/route.ts`
  - Resolve `secret = readAlertWebhookSecret(parsed.data.signingSecret)` **before** calling `defaultAlertDeduplicator.shouldDispatch(...)`.
  - If `!secret`, return `NextResponse.json({ ok: false, code: 'ALERT_CONFIG_ERROR', error: ALERT_MISSING_SECRET_ERROR }, { status: 503 })`.
- **Modify:** `.env.example` & `src/lib/edition/edition-mode.ts`
  - Document `CASHCLAW_ALERT_WEBHOOK_SECRET`.
- **Create:** `src/ee/alerts/__tests__/alert-webhook-secret.test.ts`
  - Test Cloudflare edge binding precedence, `process.env` fallback, `explicitSecret` override, fail-closed `503` when missing, and verify that a `503` response does not consume the deduplicator cooldown window.

## Verification
- `npx vitest run src/ee/alerts/__tests__/alert-webhook-secret.test.ts`
