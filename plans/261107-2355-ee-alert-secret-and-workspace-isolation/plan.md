---
title: "EE Alert Webhook Secret Fail-Closed & Cross-Tenant Workspace Isolation"
description: "Eliminate hardcoded 'default_alert_secret' fallback in /api/ee/alerts with Cloudflare Workers edge-binding resolution and fail-closed 503 behavior, and close cross-tenant workspace spoofing across /api/ee/alerts, /api/ee/credits, and /api/ee/scheduler."
status: completed
priority: P1
effort: 2h
branch: fix/ee-alert-secret-and-workspace-isolation
tags: [ee, security, alerts, credits, scheduler, tenancy, cloudflare-workers]
---

# Plan: EE Alert Webhook Secret Fail-Closed & Cross-Tenant Workspace Isolation (`261107-2355`)

## 1. Objective & Root Cause Evidence

Following the closure of the NOWPayments IPN revenue seams (`261106-1416`, PR #36), four residual security and multi-tenant isolation seams remain in `src/app/api/ee/`:

1. **Hardcoded `'default_alert_secret'` fallback & missing Cloudflare Workers edge binding (`src/app/api/ee/alerts/route.ts:66`)**:
   - Currently: `const secret = parsed.data.signingSecret || process.env.CASHCLAW_ALERT_WEBHOOK_SECRET || 'default_alert_secret';`
   - When neither `signingSecret` nor `process.env.CASHCLAW_ALERT_WEBHOOK_SECRET` is set, `/api/ee/alerts` signs webhook envelopes with the public literal `'default_alert_secret'`, allowing any attacker to forge signed alert webhooks.
   - Furthermore, on Cloudflare Workers edge runtime, secrets configured via `wrangler secret put` are exposed on `getCloudflareContext().env`, not `process.env`.
   - Finally, `defaultAlertDeduplicator.shouldDispatch(...)` currently runs *before* secret resolution, so a failed dispatch would still consume the deduplication cooldown window.

2. **Alert envelope `workspaceId` spoofing (`src/app/api/ee/alerts/route.ts:52`)**:
   - Although `tierContext` is resolved via `resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId })`, the signed `CloudAlertEvent` still sets `workspaceId: parsed.data.workspaceId` directly instead of the session-authorized workspace. An authenticated user on `ws_attacker` (PREMIUM) can pass `workspaceId: "ws_victim"` and obtain a server-signed webhook envelope claiming `workspaceId: "ws_victim"`.

3. **Unenrolled session user IDOR fallback in `/api/ee/credits` (`src/app/api/ee/credits/route.ts:35,60`)**:
   - When a signed-in user (`x-user-id` set by middleware) has 0 rows in `saas_workspace_members`, `resolveWorkspaceTierContext` returns `{ workspaceId: undefined, tier: 'BASIC' }`.
   - `credits/route.ts` then computes `const effectiveWorkspaceId = resolvedWorkspaceId ?? parsed.data.workspaceId;`, falling back to the unverified client-supplied `workspaceId` (`"ws_victim"`) and allowing the user to read or debit another tenant's credit balance.

4. **Missing workspace resolution in `/api/ee/scheduler` (`src/app/api/ee/scheduler/route.ts:15,38`)**:
   - Neither `GET /api/ee/scheduler` nor `POST /api/ee/scheduler` calls `resolveWorkspaceTierContext(req)`. A signed-in user can pass `workspaceId: "ws_victim"` to inspect active lease counts or acquire tick leases on another workspace's bots (cross-tenant lease DoS).

## 2. Phases

| Phase | File | Scope | Status |
|---|---|---|---|
| Phase 01 | [phase-01-alert-secret-fail-closed.md](./phase-01-alert-secret-fail-closed.md) | Create `src/ee/alerts/alert-webhook-secret.ts` (edge binding + `process.env`, no default literal), fail closed with `503 ALERT_CONFIG_ERROR` in `POST /api/ee/alerts` before deduplication, document env vars in `.env.example` and `edition-mode.ts`. | Completed |
| Phase 02 | [phase-02-ee-workspace-isolation.md](./phase-02-ee-workspace-isolation.md) | Add `resolveEffectiveWorkspaceId` in `src/ee/tenancy/workspace-request-context.ts` and enforce session-scoped workspace isolation across `/api/ee/alerts`, `/api/ee/credits`, and `/api/ee/scheduler` + comprehensive unit/integration tests. | Completed |

## 3. Acceptance Criteria (Done Means)

1. `grep -rn "default_alert_secret" src/` returns 0 hits in production code (only in fail-closed regression tests).
2. `POST /api/ee/alerts` without `signingSecret` and without `CASHCLAW_ALERT_WEBHOOK_SECRET` / `CASHCLAW_ALERT_SIGNING_SECRET` returns HTTP `503` with `ALERT_CONFIG_ERROR: Missing CASHCLAW_ALERT_WEBHOOK_SECRET` and does **not** record the event in `defaultAlertDeduplicator` (subsequent configured request within cooldown still dispatches).
3. `readAlertWebhookSecret()` reads `getCloudflareContext().env` first, then `process.env`, matching `readIpnSecret()`.
4. Authenticated requests (`x-user-id` header set by middleware) to `POST /api/ee/alerts`, `GET/POST /api/ee/credits`, and `GET/POST /api/ee/scheduler` never act on an unowned `workspaceId` supplied in query/body — even when the session user has 0 rows in `saas_workspace_members` (falls back to deterministic personal workspace `ws_<safeUserId>`).
5. `npm run quality:gate` (`tsc --noEmit`, `eslint src/ --max-warnings 0`, `vitest run --coverage`, `knip`) exits `0` with 0 errors, 0 warnings, and 0 `:any`.

## 4. Non-Goals

- No live trading or CEX order execution changes (ADR-001 paper-only invariant).
- No changes to public IPN webhook paths (`/api/ee/billing/ipn`, `/api/ee/billing/nowpayments-ipn`) or checkout flow.
- No database migration changes required.
