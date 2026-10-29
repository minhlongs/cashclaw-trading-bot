# PR #35 — Authorization, quota, and NOWPayments review

**Review date:** 2026-10-29
**Repository / branch:** `minhlongs/cashclaw-trading-bot` / `arena/06ec4bf4-cashclaw-trading-bot`
**PR:** [#35](https://github.com/minhlongs/cashclaw-trading-bot/pull/35) — OPEN, Draft
**Base:** `main` at `11a774e820920dfbdb8e0ee52fe4599a69851770`
**Code head with completed local verification:** `48c33e7c0e87f92d32cc62045931e344d96e88fa` (GitHub results in §4). Earlier source commits `8c31d44` and `90f4b93` are superseded; a report-only follow-up may advance the branch.
**Review status: PARTIAL.** Authorization, workspace quota, and payment callback blockers are fixed and covered locally, but this report is not a merge/production approval. Browser evidence could not be recovered/revalidated in this workspace; local Knip is also blocked by the host's memory limit. Recheck the pushed commit and hosted checks before deciding anything.

This PR does **not** establish that OPC Trading Platform is complete, SaaS-ready, live-ready, or profitable. No merge, deployment, remote D1 migration, live mode, real order, real-money use, or real payment was performed.

## 1. Findings and repairs

| Finding in the prior PR body | Repair in this worktree | Regression evidence |
|---|---|---|
| Tier, workspace, active-bot count and user identity could be taken from request values; membership was not authoritative. | `resolveWorkspaceTierContext()` now resolves an unexpired `session_id` against D1, then active workspace membership and stored entitlement. It ignores caller-supplied tier/user/count headers. Unknown/inactive workspace is concealed as 404; session missing/expired is 401; DB/session failure is 503. | D1 session/workspace tests; forged `x-user-id`, `x-cashclaw-tier`, query tier and active-count headers; no-member, missing workspace, expired session and DB failure. |
| Bot quota used a check/count followed by create, allowing concurrent callers through the same last slot. | `saas_bot_create_reservations` uses a unique D1 reservation row and one `INSERT … SELECT` against authoritative membership, entitlement, persisted bot state and unexpired reservations. Reservation lease/retry/idempotency is D1-backed. Bot creation remains paper-only. | Wrangler local SQLite concurrency at BASIC cap: exactly one reservation and one persisted bot; retry, same-ID replay, conflicting hash, expired lease, create failure/release and workspace isolation. |
| NOWPayments entitlement GET required a session but did not bind requested workspace to the user. | `GET /api/ee/billing/nowpayments-ipn` resolves session + active membership and returns only that workspace entitlement. Billing order creation requires OWNER and server-calculates price. | D1 user A/B, missing/expired session, no membership, VIEWER role and forged identity tests. |
| Callback entitlement mutation and callback/audit history were separate writes; replay could report activation without binding it to current entitlement. | Both callback paths verify HMAC and route through order-bound D1 batch. Order/payment/workspace/owner/status/price/currency binding, monotonic status handling, idempotent event history, entitlement upsert/refund, legacy event write and processed marker are in one transactional D1 batch. Response `activated` is true only when this new event changed entitlement and readback matches current payment/tier/expiry. | Injected final-event failure rolls back payment/order/entitlement and succeeds on retry; injected order-mutation failure rolls back inserted event and succeeds on retry; duplicate concurrent callback, changed-body same-payment replay, readback after reopen, invalid HMAC, cross-order/payment reuse, amount mismatch, late/terminal/out-of-order/refunded callbacks. |

These callbacks are **idempotent**, not claimed to be exactly-once. A provider retry with the same event does not re-extend a subscription; replays report `activated:false`. A different event body for the same provider payment also cannot extend it again.

## 2. Routes, callers, status semantics, compatibility

The direct handlers resolve the session themselves; route tests therefore do not depend on middleware injecting `x-user-id`. Middleware additionally requires DB-backed sessions for API mutations and selected sensitive GETs, removes forged `x-user-id`, and rejects explicit foreign Origin or `Sec-Fetch-Site: cross-site`. Exact signed payment POST paths are exempt from session/origin middleware; their handler verifies NOWPayments HMAC. Missing Origin is allowed only with a valid session for middleware-protected writes, matching prior middleware policy.

| Route / caller | Authorization and enforcement now | Important status / compatibility effect |
|---|---|---|
| `GET/POST /api/bots` — dashboard, bot wizard | Session → selected/default personal workspace → active membership; GET lists only workspace bots. POST permits OWNER/ADMIN/TRADER, PAPER only, and D1-reserves a slot before persistence. Request tier/count/user claims do not affect limits. | 401 missing/expired session; 404 no membership/workspace; 403 role/quota; 409 idempotency conflict/in-progress; 503 persistence/DB failure; 400 invalid/live payload. No anonymous or live bot creation. |
| `GET/POST/PATCH /api/bots/[id]` — bot detail/actions | Reads the bot only by `(id, workspace_id)`; mutation requires OWNER/ADMIN/TRADER. | Cross-workspace bot IDs return 404. Previously global bot lookup behavior is intentionally narrowed. |
| `GET /api/ee/quotas`, `/api/ee/credits`, `/api/ee/sync`, `/api/ee/alpha-feed`, `/api/ee/alerts`, `/api/ee/scheduler` | These route handlers now consume session-resolved workspace/tier rather than query/header/body tier. Alerts/scheduler also check workspace bot binding. `alpha-feed` is now session-protected at the handler even though it was previously public. | Client-selected tier/workspace cannot grant a higher tier. This changes the formerly public alpha-feed route; clients must authenticate. Sync endpoint validates a signed PAPER_ONLY bundle; it does not persist a bot. |
| `POST /api/ee/billing/orders` — checkout modal | Session + OWNER membership; strict request schema accepts workspace and target tier only; price comes from server tier table. | 201 returns a pending order with `providerInvoiceCreated:false`; 400 invalid body/price claim, 401 unauthenticated, 403 non-owner, 404 inaccessible workspace, 503 storage failure. The UI explicitly says no invoice/payment was created. |
| `GET /api/ee/billing/nowpayments-ipn?workspaceId=…` — billing client | Session + active workspace membership, entitlement owner/workspace join; caller may read only a workspace where they hold active membership. | 401/404/503 as above. This endpoint no longer leaks cross-workspace tier data. |
| `POST /api/ee/billing/nowpayments-ipn` and legacy `/api/ee/billing/ipn` — provider callback | No app session (provider cannot present one); exact paths require configured HMAC secret and `x-nowpayments-sig`; body workspace/tier authority fields are rejected. Server order binds workspace, owner, target tier, amount/currency and payment ID. | Missing signature 401; unconfigured secret/D1 failure 503; invalid HMAC 403; malformed/authority-bearing payload 400; permanent order/binding mismatch 404; success/replay 200 with `paymentStatus` reflecting stored order state, not stale callback status. Failed/expired/cancelled terminal states and refunds cannot be followed by a late success. Optional timestamp headers are ignored because they are not HMAC-bound; durable D1 idempotency is the replay control. |
| `/api/ee/telemetry`, `/api/quant/telemetry` | Telemetry-only surfaces; `costTier` is simulation telemetry, not SaaS entitlement enforcement. `resolveLlmKeyRouting()` has no production caller. | Not used to enforce workspace tier/quota. |
| Worker `/internal/api/bots/*` | Separate machine/admin API, protected by configured Bearer `ADMIN_TOKEN`; not an app-user workspace API. | No broad webhook/cron exception added. |

Quota accounting counts workspace bot statuses `draft`, `paper_test`, `live_running`, and `paused`, plus live unexpired D1 create reservations with no persisted bot. `stopped` and `error` are not counted. Revoked/expired paid entitlement is enforced at BASIC capacity. This is deliberately stricter/clearer than trusting a caller-supplied count.

**Remaining scope limitation:** the EE credit-ledger balances and several unrelated schedulers/alert/telemetry stores are still in-process stores. Tier selection for those routes is now server-authoritative, but this review does not claim D1 durability for their usage balances or deduplicators. In particular, do not treat the in-memory credits ledger as durable billing metering.

## 3. Local D1 evidence and migration

`migrations/0016_workspace_authorization_quota_billing.sql` is additive; historical migrations were not edited. It adds workspace/membership data, entitlement expiry/revocation/payment references, bot workspace binding, reservation/order/event tables and indexes. Legacy paid rows without provable expiry are retained but revoked/fail closed; pre-existing bots are assigned deterministic personal workspaces. Existing paid access can therefore fall back to BASIC until a separately verified subscription is represented with expiry/payment linkage. This is a deliberate compatibility/security trade-off, not a zero-downtime rollout guarantee.

Two migration exercises used isolated Wrangler local D1 SQLite state, no `--remote`:

1. **Upgrade:** applied migrations 001–0015, seeded synthetic user/session, legacy paid workspace and bot, then applied 0016. Readback confirmed the original paid row remained but had `revoked_at_ms=2000`, owner membership was created, bot moved to `personal:upgrade-user`, and the personal workspace got BASIC entitlement.
2. **Fresh:** applied migrations 001–0016 to an empty local DB. Readback confirmed the five new tables (`saas_workspaces`, `saas_workspace_memberships`, `saas_payment_orders`, `saas_nowpayments_ipn_event_history`, `saas_bot_create_reservations`). Both commands exited 0.

The D1 integration suite uses the Wrangler local SQLite backing file through `LocalD1Database`; it is real local SQLite persistence and transactions, **not** a running Cloudflare Worker D1 binding. Batches use SQLite `BEGIN IMMEDIATE`/COMMIT/ROLLBACK. Test-only triggers inject both mutation/event failures. It does not represent a remote migration or production concurrency test.

Migration rollout is not authorized here. Before rollout, inspect target D1 migration history/data, back up, review paid-customer compatibility, apply the approved migration before code that depends on it, and plan mixed-version/rollback behavior. No remote migration was run.

## 4. Verification on current worktree

| Command / evidence | Result |
|---|---|
| `npm test -- --run src/ee/billing/__tests__/nowpayments-order-store.d1.test.ts src/app/api/ee/billing/nowpayments-ipn/route.test.ts --reporter=dot` | Exit 0 — 2 files, 19 tests. Local D1 callback/order/quota tests include transaction rollback/retry, duplicate and changed-body replay, terminal/out-of-order/refund state, binding, signature, owner/session and concurrency. |
| `npm run quality:gate` | Exit 1 at final `npx knip`. Its preceding `type-check`, `lint`, and full `vitest run --coverage` completed; coverage run summary: 728 files / 6,089 tests passed. One cache-dependent determinism pin self-skipped with its explicit “cache not available” note. Knip 6.32.2 / Oxc parser 0.143.0 on Node 22.22.3 throws `RangeError: Array buffer allocation failed` creating its fixed ~6 GiB parser buffer on this host. No rules/files/scope disabled; failure is not swallowed. |
| `npm run type-check` | Exit 0. |
| `npm run lint` | Exit 0, ESLint `src/` with `--max-warnings 0`. |
| `npm run build:worker` | Exit 0; Next/OpenNext Cloudflare bundle built with all API routes including billing orders and both callback routes. Existing middleware-to-proxy deprecation warning remains. |
| Governance/secret hygiene: `git ls-files` secret-pattern check + `npx vitest run src/tree/__tests__/open-core-boundary.test.ts src/tree/cli/__tests__/paper-cli-report.test.ts src/ee/__tests__ --reporter=dot` | Exit 0; 10 files / 39 tests passed; no tracked `.claude`, `.agentkit` or non-example `.env` leak found. |
| Fresh/upgrade local D1 migrations | Exit 0 both, readbacks above. |
| GitHub checks on exact pushed head `48c33e7c0e87f92d32cc62045931e344d96e88fa` | CI run [40876278831](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40876278831): **FAIL** at `Dead code check` (`npx knip`, exit 1); preceding type-check, lint, build and full test steps PASS. Governance run [40876278838](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40876278838): **PASS**. The earlier run [40875227065](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40875227065) had full Test step PASS but the same dead-code failure; run [40874208792](https://github.com/minhlongs/cashclaw-trading-bot/actions/runs/40874208792) first failed in the D1 suite's default 5-second `beforeAll`, so the local-D1 hooks were extended and retested. GitHub annotations expose only the Knip process exit code; raw Actions log retrieval returned EOF in this environment, so the specific Knip diagnostic is **unknown**, not inferred. Earlier all-green runs are for older SHAs and are not evidence for this head. |
| Browser E2E / Operations screenshot | **NOT VERIFIED in this continuation.** An earlier report described hydrated Playwright/Chromium Operations evidence at `/home/user/pr35-operations-e2e.png`, but that file and script are not present in the current workspace, and no Playwright/Chromium runtime is installed here. Route and jsdom unit tests are not browser E2E. Do not claim the prior screenshot is retained or revalidated. |

The local integration test emits a Vitest `environmentMatchGlobs` deprecation warning; unrelated test logs include expected synthetic DB-unavailable and network-failure cases. Neither was suppressed. `git diff --check` and exact-head hosted checks must be run again after documentation and commit.

## 5. Operations and non-claims

The Operations work-item work remains separate from the billing remediation: migration 0015, D1 status history/CAS and session-derived owner checks are still part of PR #35. This continuation did not alter those flows, and the full suite includes Operations route/UI unit tests. Because the previous browser artifact is unavailable as described above, current browser evidence is incomplete.

The readiness status is **PARTIAL**, not a recommendation to merge. No statement here establishes trading edge, profitability, live safety, completed SaaS metering, or full OPC readiness. No merge/deploy/remote migration/real invoice/payment/live order was performed.

## 6. Before owner review

1. Commit and push only to `arena/06ec4bf4-cashclaw-trading-bot`; keep PR #35 Draft.
2. Replace the stale PR body, link this report, and verify CI + governance checks on the exact pushed SHA.
3. Recover or rerun the Operations Playwright/Chromium evidence in an approved browser environment and attach/store the screenshot in a durable review location; route/UI unit tests do not substitute.
4. Decide separately how to persist the EE credit ledger and how to migrate legacy paid customers. Do not represent the in-memory credit ledger as durable billing metering.
5. Obtain owner approval for any future remote migration or production rollout. None is authorized by this work.
