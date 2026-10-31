# OPC Trading Platform — verified readiness (updated 2026-10-29)

## Result: PARTIAL — do not enable live execution

Current A–H report with exact local E2E evidence, check results, limits and artifact hashes: [OPC readiness report (2026-10-29)](./opc-platform-readiness-2026-10-29.md).

This checkout contains a substantial existing CashClaw trading/research application and SaaS-oriented modules. This pass added an owner-scoped persistent internal operations work queue and closed two existing session-validation defects needed to secure its API. It is not a completed ERP/CRM/helpdesk, nor a production multi-tenant SaaS release.

## Verified baseline

- Repository was accessible at `arena/aaf3c0b2-cashclaw-trading-bot`, based on `7df2d7d`; there were no pre-existing working-tree changes at inspection.
- Application: Next.js App Router, React, TypeScript, OpenNext/Cloudflare Workers, D1; Vitest/RTL/ESLint. No `.claude/` directory despite the stale `AGENTS.md` reference.
- Existing product surfaces include paper bot management, backtests, market ticker/research tools, killswitch/monitoring, exchange adapters, D1 repositories, SaaS billing/entitlement/sync modules, and extensive quantitative research tests.
- Bot creation rejects `mode: live`, and the manager's live exchange path throws. The separately exported `LiveExchange` adapter had been executable when constructed directly. The adapter is now fail-closed by default and requires an explicit pre-trade approval/audit callback before it can dispatch an order. No production callback is wired.
- Existing `docs/decisions/adr-001-ccxt-workers-feasibility.md` says CCXT-on-Workers is NO-GO; deployment safety docs say production is paper-only. Historical readiness/deployment docs are not proof of current remote state.

## Work delivered in this pass

- Added migration `0014_ops_workflow.sql` for owner-scoped records in five internal areas (finance, operations, marketing, sales, customer support), with an append-only status event table.
- Added bilingual `/[locale]/operations` UI to create/list/advance/cancel internal work items. The finance form stores an optional integer amount in minor units; it does not implement accounting or ledger controls.
- Added authenticated D1-backed API endpoints: `GET/POST /api/ops/work-items`, `PATCH /api/ops/work-items/[id]`; list/update queries scope by owner. Missing session, D1, or database errors fail closed.
- Added migration `0015_ops_work_item_concurrency.sql`: compare-and-swap item versions, trigger-generated status history, and append-only event protections. Create and status-event versions are recorded as 0, 1, 2, …; status updates use `UPDATE ... RETURNING` to avoid treating trigger writes as a concurrent-write conflict.
- Added operations routes to the protected API prefixes. Session resolution queries the actual `user_sessions.id` primary key and compares epoch-second expiry strictly; middleware strips client `x-user-id`, requires a DB-backed session by default for mutating `/api/**` requests (not only Operations), and rejects cross-origin/cross-site API writes. Public login/logout/me remain public; the two NOWPayments IPN endpoints are explicit middleware exceptions because their handlers verify HMAC signatures.
- Pinned the route locale into `getMessages` and `NextIntlClientProvider`; this fixed `/en/operations` being server-rendered in Vietnamese.
- Hardened the unconnected `LiveExchange` adapter: execution is disabled unless explicitly enabled and a pre-trade approval/audit gate is installed; rejected/missing safety gate prevents dispatch. Fixed daily loss checks so profitable positive P&L is not incorrectly treated as a loss breach.
- Added route/middleware/live-adapter tests and updated navigation translations/tests.

## Capability checklist

| Capability | Status | Evidence / limitation |
|---|---|---|
| Research and market data | PASS (code/test scope) | Existing alpha research, data-quality, ticker, and microstructure modules and tests are present. No external provider credentials/data entitlement were used in this pass. |
| Backtest with fees and slippage | PASS (code/test scope) | Existing backtest/cost modules, trade fee fields, slippage models, and tests; results are simulations and do not establish trading edge. |
| Paper trading | PASS (code/test scope) | Bot creation defaults/restricts to paper; `BotManagerFactory` only supplies a paper exchange; paper exchange adapter/tests exist. No production deployment re-verified. |
| Exchange read-only/shadow | BLOCKED | Adapter code exists, but no authorized exchange account, credentials, or real connectivity/permissions check was available. No keys were requested or used. |
| Live adapter safety | BLOCKED | Adapter now defaults off and rejects orders without an explicit gate. No production-grade policy implementation is wired for strategy approval, sizing, exposure, stale quotes, durable idempotency, exchange-state reconciliation, audit, or post-trade reconciliation. Never enable by setting a flag alone. |
| Finance operations | BLOCKED (scope incomplete) | Shared persisted work items and optional minor-unit amount are present; this is not double-entry accounting, approvals, reconciliation, tax, or billing reconciliation. |
| Operations administration | BLOCKED (scope incomplete) | Shared work-item lifecycle is present; no asset/vendor/procurement/SLA/automation model. |
| Marketing | BLOCKED (scope incomplete) | Shared work-item lifecycle is present; no consent-aware contact store, analytics attribution, or campaign integrations. |
| Sales | BLOCKED (scope incomplete) | Shared work-item lifecycle is present; no CRM pipeline, quotes, contracts, or customer account model. |
| Customer support | BLOCKED (scope incomplete) | Shared work-item lifecycle is present; no ticket SLA, external channel ingestion, customer identity, or response tooling. |
| Operations workflow UI → permission → D1 → UI | PASS (local D1 HTTP E2E; browser UI not exercised) | Two synthetic users authenticated through the actual login/session routes. On local D1, tested create → status updates → history, invalid transition, forged identity, cross-owner read/write, expired/no session, CSRF/origin rejection, validation, and persistence after a separate Wrangler process restart. `/vi/operations` and `/en/operations` render their correct language; browser automation/screenshot was not available. |
| Multi-workspace SaaS, RBAC, billing | BLOCKED for production | Entitlement/billing/tenancy modules exist but were not audited end-to-end against real identities/payments. New ops records are user-owner-scoped, not workspace-scoped; no granular role approval is implemented. |

## Checks run

- `npm ci --ignore-scripts --no-audit --no-fund` — PASS, dependencies installed from lockfile.
- `npm run type-check` — PASS.
- `npx vitest run src/app/api/ops/work-items/route.test.ts src/middleware.test.ts src/tree/exchange/live/index.test.ts` — PASS, 29 tests.
- `python3` in-memory SQLite execution of migration 0014 plus row/audit inserts — PASS. This is a schema smoke check, not D1 integration.
- `npm run build` — PASS, Next production build generated routes including `/[locale]/operations` and its APIs.
- `npm run lint` — PASS, zero warnings after correcting the operations page effect.
- `npm run type-check` — PASS (`tsc --noEmit`).
- `npm test` — PASS, 6,051 tests across 725 files; includes the API/middleware, new operations client, live-adapter guard (including missing risk config), and updated navigation coverage. Vitest prints an existing deprecation warning for `environmentMatchGlobs`; no test failures.
- `npm run build` — PASS, Next production build generated both localized operations pages and the two `/api/ops/work-items` routes. Next prints the existing convention deprecation warning for `middleware` → `proxy`.
- `npm run db:apply` — PASS against local D1 only; all 14 migrations applied. No `--remote` operation was run.
- Local D1 persistence check — PASS: inserted a temporary owner-scoped row and audit event, verified them in a separate Wrangler invocation, updated status and added a second event, verified state/event count, then removed the temporary rows. This exercised local D1 tables/SQL, not the Next HTTP API or browser session end-to-end.

## Follow-up verification on 2026-10-29

- The working branch is `arena/06ec4bf4-cashclaw-trading-bot`, based on `11a774e820920dfbdb8e0ee52fe4599a69851770`; no remote D1, deployment, live order, payment, or real-user data was used.
- Local Wrangler D1 applied migrations 0001–0015. Two synthetic `@example.invalid` users logged in through `/api/auth/login`; session cookies were issued and resolved from D1 (not injected as trusted identity headers).
- HTTP E2E against the OpenNext Worker + local D1 verified: unauthenticated and expired session 401; create 201; forged `x-user-id` ignored; user B cannot list/read/update A's record (404); foreign Origin mutation 403; invalid date 400; illegal state transition 409; `open → in_progress → done` returns 200 with versions 1 and 2; repeated `done` is an idempotent no-op; event history is `created@0`, `open→in_progress@1`, `in_progress→done@2`. SQL inspection confirmed owner, terminal status, versions and matching event rows.
- Process-restart persistence was verified: after stopping and starting Wrangler with the same local persistence directory, the synthetic user could log in again and read the final item plus all three events. This is local D1 only.
- The HTTP page checks found `/en/operations` was rendered in Vietnamese before the locale fix; after pinning locale and messages it rendered English, while `/vi/operations` rendered Vietnamese. No Chromium/Playwright/browser automation was installed, so no hydrated interaction or screenshot is claimed.
- A deterministic synthetic AlphaResearchPipeline run completed all 12 steps and honestly recommended `discard` (Sharpe 0.0000; 194 derivative signals). A separate local `runBacktest`/`PaperExchange` simulation on 8 synthetic hourly candles recorded 2 trades, fees 4.18, fee assumption 0.1%, slippage assumption 0.05%, and 8 equity points. The result envelope with fixture provenance was persisted to a temporary table in local D1 and read back after a Worker restart; SHA-256 was `fac0916943847d1d045fa3817c70b1214b3a4f0b91163a63622f0fa175aea13a`. This was an isolated synthetic paper simulation, not a real-data edge claim; the ad hoc persistence harness does not prove the production backtest action's full D1 write path.
- Final full tests: `npm test -- --reporter=dot` — PASS, 726 files / 6,064 tests. Targeted Operations/auth tests — PASS, 48 tests. `npm run type-check`, `npm run lint`, and final `npm run build:worker` after the middleware refactor — PASS.
- `npm run quality:gate` type-check and lint passed and the coverage test run completed, but the command exited 1 at `npx knip`: Knip's Oxc parser attempted a 6 GiB `ArrayBuffer` and Node failed with `RangeError: Array buffer allocation failed`. Standalone full Vitest passed afterward; Knip remains an environment/tooling blocker, not a green governance check.
- Readiness remains PARTIAL: the five departments are a shared work queue, not full department products; tenancy/RBAC/billing has not been validated end-to-end; live trading remains default-off and lacks production-grade authorization/risk/idempotency/reconciliation controls; no production deployment state was checked.

## Before live can be reconsidered

1. Keep runtime live execution disabled. No live keys/accounts have been configured or approved.
2. Implement a real, independently reviewed strategy-level approver/expiry/revocation registry and fail-closed authorization; UI role checks alone are insufficient.
3. Implement injected, durable pre-trade policy checking: bounded sizing, portfolio and per-symbol exposure, loss/drawdown thresholds, fresh market data, synchronized exchange status/open orders/positions/balances, and persistent idempotency reservation.
4. Make audit append durable before dispatch; capture exchange acknowledgments and ambiguous outcomes; implement cancel/retry safety and reconciliation that blocks new orders whenever exchange/local state diverges.
5. Add adversarial/integration tests against a testnet with non-trading/read-only credentials first; separately review signature handling, key isolation/rotation, network/runtime compatibility, rate limits, clocks, and emergency kill controls. Testnet does not equal permission to trade production funds.
6. Obtain separate explicit user approval, account authorization, operational runbook, alerting, rollback plan, limits, and compliance/legal review. No approval or deployment was performed in this pass.

## Next steps

- For local development, run `npm run dev`; local Wrangler D1 migrations 0001–0015 were applied to the temporary E2E database used for this verification. Sign in with a valid local account before using `/vi/operations` or `/en/operations`. API calls fail closed (401/503) when auth or D1 is unavailable.
- Add browser-driven hydration/interaction and screenshot coverage when a browser runtime is available; the HTTP/API workflow against local D1 has already been exercised. Do not run `db:apply:remote`; remote D1 is intentionally untouched.
- Add workspace membership and roles to the operations API before allowing multiple OPC staff or customer workspaces.
- Implement dedicated finance, marketing, sales, and support bounded contexts; the shared work queue is a first durable internal workflow, not a replacement for those products.
