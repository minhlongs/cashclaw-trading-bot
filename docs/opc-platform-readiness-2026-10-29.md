# PR #35 review — Operations, middleware auth, and local D1

**Review date:** 2026-10-29
**Repository:** `minhlongs/cashclaw-trading-bot`
**Branch:** `arena/06ec4bf4-cashclaw-trading-bot` (kept; PR remains Draft)
**Base:** `11a774e820920dfbdb8e0ee52fe4599a69851770`
**Review status: PARTIAL — not a merge/production recommendation.**

The changed Operations flow was reviewed and exercised through the hydrated UI, application sessions, OpenNext Worker, and local D1. Migration 0015, concurrent status updates, session failure cases, callback signature/retry behavior, and the cross-API middleware surface were reviewed. The review also confirmed unresolved authorization defects outside the Operations data path: SaaS tier can be self-selected on several routes, and the NOWPayments entitlement GET does not bind a requested workspace to the authenticated owner. A valid session is authentication, not authorization. Those need an owner decision/fix and regression tests before this PR can be considered safe to merge as a security boundary. This report does **not** claim the broader OPC Trading Platform is complete, SaaS-ready, live-ready, or profitable.

No production deployment, remote D1 migration, live mode, real-money order, or real payment was performed.

## 1. Repository and scope

- PR: [#35](https://github.com/minhlongs/cashclaw-trading-bot/pull/35), title “Harden session-scoped Operations and local D1 concurrency”.
- The PR adds session-derived identity, Operations owner scoping, optimistic version checks and append-only status history via `0015_ops_work_item_concurrency.sql`, locale fixes, middleware checks, callback hardening, and tests/docs.
- The current local review edits are **not yet in the PR head** until committed/pushed. Remote checks observed before those edits apply only to the then-current SHA, not these local changes.
- Files reviewed include middleware and its callers/tests, Operations API/UI/migration and migrations 0013–0015, EE tier/credits/quota/sync and NOWPayments routes/stores/verifier, Worker Hono auth routes, and relevant tests.

## 2. Middleware/API route and caller audit

The Next middleware matches application requests and applies two independent rules: cross-origin checks for API mutations, and session requirements for all API mutations plus the listed sensitive GET prefixes. The session is looked up in D1 by the `session_id` cookie and must be unexpired. The middleware deletes incoming `x-user-id` and injects the user ID it resolved. The per-route handler still needs authorization/tenant checks; this middleware does not create workspace membership or RBAC.

| Route/method group | Expected caller | Auth before → after this PR | Behavior/tests and conclusion |
|---|---|---|---|
| `POST/PUT/PATCH/DELETE /api/**` (default) | Logged-in browser; any external clients must use the application session | Before: middleware did not require a session for every API write. After: DB-backed session required; no/expired session → 401, unavailable D1/session validation → 503. Foreign `Origin` or `Sec-Fetch-Site: cross-site` → 403. | Middleware tests exercise public exceptions, session, expiry, DB failure, cross-origin, and forged `x-user-id`. This is a compatibility change across APIs, not only Operations. No machine-client exemption was added. |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Login/logout form and session check | Public at middleware; route validates credentials/session as applicable. Login/logout cross-origin mutation still denied. | Login and session routes have tests; login fails closed when DB/config unavailable. |
| `GET /api/bots/**`, `/api/settings/**`, `/api/alpha/**`, `/api/ops/**`, `/api/ee/credits/**`, `/api/ee/quotas/**`, `/api/ee/scheduler/**`, `/api/ee/telemetry/**`, `/api/ee/billing/nowpayments-ipn/**` | Dashboard or operator; a number of these GETs have no in-repo caller | Before: route-specific coverage varied. After: DB-backed session required. | Prefix coverage is in `src/middleware.test.ts`. Important limitation: a session only authenticates a user; bot operations and EE routes still require per-user/workspace authorization. |
| `GET /api/ee/alpha-feed` | Public paper-advisory feed | Public before and after | Remains public and marked `PAPER_ADVISORY_ONLY`; however, tier selection is caller-controlled (see §3). |
| `POST /api/ee/billing/ipn`, `POST /api/ee/billing/nowpayments-ipn` (exact paths only) | NOWPayments server callback | Exact POSTs are exempt from session and middleware origin checks; handler must verify NOWPayments HMAC. | Valid HMAC, missing/invalid secret, malformed/bad signature, D1 persistence failure, retry, and durable replay are covered by tests/local D1 exercise. Other methods/paths do not inherit the exception. No test-secret fallback is used. |
| `GET /api/ee/billing/nowpayments-ipn` | Authenticated billing client/operator | Now requires a session through the sensitive GET prefix. | **Still vulnerable to cross-workspace entitlement reads:** the handler accepts caller-selected `workspaceId` and does not compare the entitlement owner to the session user. Session gate is not tenant authorization; see §3. |
| Hono `POST /api/cron/*`, `/api/killswitch/*`; `/internal/api/bots/*` | Worker operator/integration | Separate from Next middleware; `authGuard()` requires a configured `ADMIN_TOKEN` Bearer credential and fails closed if absent/wrong. | Worker route tests exercise missing/valid bearer cases. Scheduled Cloudflare events are platform-invoked and do not call these public HTTP routes. Hono CORS is separate and does not replace bearer auth. |
| Other public GETs, including Worker `/api/health`, `/api/version`, `/api/killswitch-status`, `/api/tickers`, `/api/quant/telemetry` and Next `/api/ee/alpha-feed` | Status/market/paper-advisory consumers | Public unless independently protected by handler | Read-only routes; route handlers and middleware tests reviewed. Public status may expose operational metadata; not changed by this PR. |

**Origin/CSRF details:** same-origin browser mutations are allowed. Explicit foreign Origin and `Sec-Fetch-Site: cross-site` are denied. A missing Origin is allowed for a valid session to preserve non-browser compatibility; no cookie still yields 401. Exact NOWPayments POST paths bypass this middleware check because third-party callbacks cannot present the application session and rely on their HMAC. The callback verifier does not use an optional timestamp header as a replay credential. External clients that omit Origin need a separate compatibility review; middleware tests do not prove every external caller.

## 3. Open authorization findings — merge blockers for security claims

### A. Caller-controlled SaaS tier is not trusted entitlement

`resolveWorkspaceTierContext()` selects a tier from `?tier=` or `x-cashclaw-tier` before consulting the entitlement store. The middleware-provided session identity does not alter this precedence, and workspace IDs supplied by the caller are not proven to belong to that user. Relevant consumers include:

- `POST /api/bots`: caller-supplied `x-cashclaw-tier` can affect the quota decision before bot creation; `resolveActiveBotCount()` also trusts caller-controlled `x-cashclaw-active-bots`, so a caller can under-report usage. The bot handlers are not shown here to enforce per-user ownership either.
- `GET/POST /api/ee/credits`: query/body tier is forwarded as `explicitTier` and affects the credit account/debit calculation.
- `GET /api/ee/quotas`, `POST /api/ee/sync`, and `GET /api/ee/alpha-feed`: tier/header/query can alter returned entitlement/quota/feed behavior.

A valid session does not prevent a user from self-selecting a higher tier. No database-backed owner-to-workspace membership source is present in the reviewed migrations; payment-created entitlement rows can have `owner_user_id = 'system'`. Do not describe these checks as SaaS authorization or entitlement enforcement. This is not repaired by the middleware work and must be resolved before relying on tier-based limits.

### B. NOWPayments entitlement GET lacks workspace owner check

`GET /api/ee/billing/nowpayments-ipn?workspaceId=...` requires a valid application session in middleware but reads a caller-selected ID and returns that workspace's entitlement without comparing `owner_user_id` with the authenticated user or a membership table. This is a tenant-isolation gap. Do not expose this endpoint as safe merely because an `x-user-id` header was injected.

### Required regression tests before claiming the gaps closed

1. User A and B have independent persisted session rows and independently owned workspace entitlements. User B requesting A's workspace via query, header, or body receives 403/404 and no entitlement/credit details; A can read only its own workspace.
2. For each route above, send a valid lower-tier session with `?tier=MASTER`, `x-cashclaw-tier: MASTER`, and where supported body/query tier. The effective tier and quota/credit operation must remain the stored server-side entitlement (or fail closed if workspace ownership is unknown); no client value may elevate it. For bot quotas, also forge `x-cashclaw-active-bots` low/high and prove the server derives usage from owned persisted bots instead.
3. Test missing/expired session and D1 unavailable for these routes (401/503), forged `x-user-id`, unknown workspace, and D1 query errors. No fallback to a more privileged in-memory/caller-supplied tier.
4. Prove signed NOWPayments POST still accepts a correctly signed synthetic callback without an application session while rejecting absent/wrong secret/signature. Keep the exception exact to the signed POST paths.

These are **acceptance criteria/design**, not passing tests in this revision. Because a workspace owner source of truth is missing, implementation needs an explicit ownership model; inventing one or silently treating `system` as a user would be unsafe.

## 4. Operations migration, history, concurrency, and D1 results

`0015_ops_work_item_concurrency.sql` was reviewed alongside migrations 0013 and 0014 and the Operations routes/store. It adds a version counter and database-side history protections required for version-aware status writes. Validation used local D1 only:

- Applied migrations from an empty local database and separately upgraded a local database already at migration 0014 with synthetic existing work-item data.
- Verified existing 0014 rows survive upgrade and receive the migration's expected initial version/history state; verified inserts and updates after 0015 persist the expected owner, status, version, and append-only event history.
- Exercised competing versioned status updates against local D1. One update wins the expected version; stale writer receives a conflict and does not create a duplicate/false history transition. History owner isolation was checked with two synthetic users.
- Through the Worker + D1 E2E, tested create, list, detail, status transition, history/version, stale status conflict, persistence on restart, invalid date, forbidden cross-owner access, and forged `x-user-id`. No header-only identity was used.
- These tests establish local migration/code behavior only. No remote migration ran. Rollout remains ordered: deploy/apply the reviewed schema before serving code that depends on it, after checking the target D1 migration history and release compatibility. Do not infer zero-downtime safety for an untested mixed-version production deployment.

## 5. NOWPayments signed callback D1 exercise

Used a synthetic-only secret and synthetic payload against the real local Wrangler Worker and D1. An injected D1 event-write failure caused a correctly signed callback to return 500 (not a success response). After removing the synthetic trigger, retry returned 200 with `activated=true`, `idempotentReplay=false`; the durable replay returned 200 with `activated=false`, `idempotentReplay=true`. D1 query confirmed the synthetic workspace entitlement and a persisted event with `signature_verified=1`. **The injected failure also showed the current entitlement upsert and event insert are separate D1 operations: the upsert can persist while the event insert fails.** The HTTP 500 plus provider retry can repair the event, but this is not atomic; do not claim all-or-nothing billing/audit persistence. The Operations status event is DB-triggered atomically with the status update; that distinct property does not extend to billing. This covered fail/retry/replay through the route/store, not real payment settlement, and does not repair the entitlement GET owner check.

## 6. Hydrated browser E2E and screenshot

Browser automation was available and used: Playwright with Chromium drove the built OpenNext/Cloudflare Worker at `http://127.0.0.1:8794` backed by local D1 `/tmp/cashclaw-pr35-browser-final4`. All users, sessions, passcodes, titles, and records were synthetic. The script `/tmp/pr35-browser-e2e.mjs` exercised user A/B login, creation/persistence, session identity, cross-owner isolation, valid/invalid transitions, stale version conflict/reload, history/version display, Vietnamese locale, 390×844 mobile layout/no horizontal overflow, and a synthetic injected API failure state. Browser assertions passed; earlier script reported eight grouped assertions. This is hydrated browser interaction, distinct from the route-level D1 HTTP checks.

After the `.ops-page` mobile bottom-padding change, a fresh screenshot was captured at `/home/user/pr35-operations-e2e.png`. In the 390×844 viewport the history event remains visible above the fixed mobile navigation; the screenshot contains synthetic data only. The local Worker was stopped and the temporary synthetic secret file removed. Wrangler's sandbox `Request.cf` TLS-fallback warning did not prevent requests; it is not a production network test.

## 7. Verification and quality gate

| Check | Result | Notes |
|---|---|---|
| Full Vitest suite: `npm test -- --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=dot` | **PASS** — 727 files, 6,075 tests | Expected test warnings/deprecations; one unrelated research determinism test skipped because its cache was unavailable. |
| Coverage suite: `npm run test:coverage -- --pool=threads --maxWorkers=1 --minWorkers=1` | **PASS**, exit 0 | V8 coverage completed across the configured test scope; this was run separately without reducing test scope. |
| `npm run build:worker` after the CSS adjustment | **PASS**, exit 0 | Next/OpenNext/Cloudflare Worker build. Next emits the existing middleware-convention deprecation warning. |
| Type-check and lint | **PASS** in the exact `npm run quality:gate` execution after docs and CSS changes | `npm run type-check` and `npm run lint` both passed on the current local tree. |
| `npm run quality:gate` / `npx knip --memory` | **FAIL locally at Knip**, exit 1 | Knip 6.32.2 uses Oxc parser 0.143.0, Node 22.22.3; `npx knip` throws `RangeError: Array buffer allocation failed` in `oxc-parser/src-js/raw-transfer/common.js` creating its fixed ~6 GiB (2 GiB block + 4 GiB alignment) buffer. Local machine reports 3.8 GiB RAM and no swap. No rule, file scope, or exit status was suppressed. |
| GitHub CI configuration | Same project lockfile/Node 22 and `npx knip`; workflow runs type-check, lint, build, tests, Knip, coverage as separate steps on `ubuntu-latest` | Remote green checks previously observed were for the pre-review SHA only. Recheck the newly pushed HEAD; do not infer it passes from local tests or old checks. Hosted runner has a different memory limit, so local allocation failure alone does not establish a CI failure. |
| Worker + local D1 callback and Operations E2E | **PASS** | Real local Wrangler/D1 requests with synthetic identities/data, including callback retry/replay and cross-owner Operations checks. |
| `git diff --check` | Must be run again after docs are finalized | No generated coverage artifacts are to be committed. |

## 8. Readiness, rollout, and explicit non-claims

- **Operations:** the reviewed app workflow is owner-scoped to the authenticated user with D1 persistence, history, version conflicts, browser UI, and mobile nav spacing. That does not imply every app API is user/workspace scoped.
- **Authentication vs authorization:** middleware now authenticates a session for broad API mutation and selected sensitive GETs; it does not implement workspace membership/RBAC. The open tier spoofing and workspace entitlement read findings above block a security/merge-ready conclusion.
- **Machine clients:** no broad cron/webhook exemption was added. Hono machine routes use Bearer `ADMIN_TOKEN`; Next API writes require the application session except exact HMAC-signed payment POSTs. Inventory/compatibility with clients outside this repository remains unverified.
- **Quality gate:** full tests, coverage and build passed, but local Knip did not. Current-HEAD GitHub CI is still required after push. This is not a green gate.
- **Product and trading:** Operations is a persisted internal work queue, not ERP/CRM/accounting/helpdesk. No claims are made about profitability, market edge, complete OPC Trading Platform readiness, SaaS readiness, or live-trading safety.
- **Forbidden actions not performed:** no merge, deployment, remote D1 migration, live-mode activation, real order, real-money use, or real payment.

## 9. Next decisions for the PR owner

1. Decide whether to expand the PR to establish server-trusted workspace ownership/entitlement before merge, or split this authorization remediation into a blocking follow-up while keeping #35 Draft. Do not mark the PR ready/mergeable based only on the session middleware or green CI.
2. Add and pass the §3 regression matrix before claiming tier or entitlement isolation.
3. Commit and push the reviewed local changes only to `arena/06ec4bf4-cashclaw-trading-bot`, update the Draft PR body with these results, and wait for checks on the new HEAD. If hosted Knip also fails, fix its environment/tool/runtime allocation without reducing analysis scope or swallowing errors.
4. Any future production rollout requires a separately approved D1 migration plan and API caller compatibility review. No remote changes are authorized here.
