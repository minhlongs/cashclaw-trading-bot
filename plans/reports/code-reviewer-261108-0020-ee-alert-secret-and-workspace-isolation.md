# Code Review Report: EE Alert Webhook Secret Fail-Closed & Cross-Tenant Workspace Isolation

- **Branch:** `fix/ee-alert-secret-and-workspace-isolation` (GitHub Issue #37)
- **Plan:** `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/plans/261107-2355-ee-alert-secret-and-workspace-isolation/plan.md`
- **Reviewer:** `code-reviewer`
- **Date:** 2026-11-08

## Scope
- **Files reviewed:**
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/.env.example` (34 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/ee/alerts/alert-webhook-secret.ts` (71 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/ee/tenancy/workspace-request-context.ts` (131 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/app/api/ee/alerts/route.ts` (96 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/app/api/ee/credits/route.ts` (91 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/app/api/ee/scheduler/route.ts` (75 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/lib/edition/edition-mode.ts` (67 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/ee/alerts/__tests__/alert-webhook-secret.test.ts` (160 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/app/api/ee/__tests__/ee-workspace-isolation.test.ts` (192 LOC)
  - `/Users/macbook/trade-bot-worktrees/ee-alert-secret-and-workspace-isolation/src/ee/__tests__/runtime-seams-e2e.test.ts` (257 LOC)
- **Scout findings:** Checked all sibling routes under `src/app/api/ee/**` (`quotas`, `alpha-feed`, `sync`, `telemetry`, `billing/ipn`, `billing/nowpayments-ipn`, `billing/checkout`) and `src/app/api/bots/route.ts` for residual secret fallbacks or cross-tenant `workspaceId` spoofing.

## Overall Assessment
**APPROVE (0 blocking issues).** All four security and tenancy seams identified in Issue #37 and `plan.md` are closed cleanly, with deterministic fail-closed behavior and full regression test coverage.

## Acceptance Criteria Verification
1. **Zero `'default_alert_secret'` in production source:** Verified via `grep -rn "default_alert_secret" src/` — 0 matches in production files; appears only in `src/ee/alerts/__tests__/alert-webhook-secret.test.ts` to assert the signature never matches the removed literal.
2. **`readAlertWebhookSecret` precedence:** Verified in `src/ee/alerts/alert-webhook-secret.ts:40-71` — reads explicit non-blank `signingSecret` first, then `getCloudflareContext().env` (`CASHCLAW_ALERT_WEBHOOK_SECRET`, `CASHCLAW_ALERT_SIGNING_SECRET`), then `process.env`, and returns `null` when absent.
3. **Fail-closed `503` before deduplicator mutation:** Verified in `src/app/api/ee/alerts/route.ts:60-77` — `readAlertWebhookSecret` and the `503 ALERT_CONFIG_ERROR` return execute at lines 60-66 before `defaultAlertDeduplicator.shouldDispatch(...)` at line 77. Pinning test confirms retries within cooldown succeed once the secret is configured.
4. **Cross-tenant workspace isolation (`resolveEffectiveWorkspaceId`):** Verified in `src/ee/tenancy/workspace-request-context.ts:95-110` and wired in `/api/ee/alerts`, `/api/ee/credits` (`GET` & `POST`), and `/api/ee/scheduler` (`GET` & `POST`). When `x-user-id` is present on the request, an unowned client-supplied `workspaceId` is never used — even when the user has 0 rows in `saas_workspace_members` (deterministically derives `ws_<safeUserId>`).
5. **Code standards & quality gates:**
   - `0` `:any` / `as any` and `0` `console.log` across all touched/new files.
   - All touched/new production and test files are `<= 200` LOC (existing `runtime-seams-e2e.test.ts` is 257 LOC; new files are 71, 160, and 192 LOC).
   - No plan IDs or phase numbers in production code comments or test names.
   - `npx tsc --noEmit`: 0 errors.
   - `npx eslint ... --max-warnings 0`: 0 warnings, 0 errors.
   - `npx knip`: 0 unused exports/files.
   - `npx vitest run` (6 EE test suites, 42 tests): 42/42 passing.

## Issues Found

### Critical / High / Medium Priority
- None.

### Low Priority (Non-Blocking Informational Notes)
1. **Tier resolution for 0-membership session users when personal workspace was pre-upgraded (`src/ee/tenancy/workspace-request-context.ts:59-61`):**
   - When an authenticated user (`x-user-id`) has 0 rows in `saas_workspace_members`, `resolveWorkspaceTierContext` returns `{ workspaceId: undefined, tier: 'BASIC' }` without querying `defaultSaasEntitlementStore.getWorkspaceTier('ws_<safeUserId>')`. In production checkout (`src/app/api/ee/billing/checkout/route.ts:33-35`), `ensureUserWorkspaceMembership` creates the D1 membership row before checkout, so real paid users have a membership row. Still, deriving `ws_<safeUserId>` directly inside `resolveWorkspaceTierContext` (when `userId` is present and `memberships` is empty) could make tier and workspace resolution even more uniform in a future cleanup.
2. **Minimum length consistency for environment secret vs per-request `signingSecret` (`src/ee/alerts/alert-webhook-secret.ts:28-38`):**
   - `CloudAlertEventSchema` requires `signingSecret` to be `z.string().min(8).optional()`, whereas `readAlertWebhookSecret` accepts any non-blank string from env/bindings. Not a security defect (env bindings are operator-controlled), just a minor validation asymmetry.

## Plan Follow-ups
- Both Phase 01 and Phase 02 in `plans/261107-2355-ee-alert-secret-and-workspace-isolation/` are fully implemented and verified. Lead/orchestrator can mark Phase 01, Phase 02, and `plan.md` status as `completed`.

## Unresolved Questions
- None.
