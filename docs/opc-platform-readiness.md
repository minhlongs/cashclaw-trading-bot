# OPC Trading Platform — verified readiness (2026-10-28)

## Result: PARTIAL — do not enable live execution

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
- Added operations routes to the protected API prefixes. Fixed middleware to query the actual session primary key (`user_sessions.id`) and compare its stored epoch-seconds expiry in epoch seconds; this fixes authentication failures affecting these operations routes.
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
| Operations workflow UI → permission → D1 → UI | BLOCKED (full E2E) | UI interaction and API handlers are separately tested; migration 0014 applied to local D1, and inserts/status/audit were verified across separate Wrangler calls. The HTTP route tests use D1 fakes and a real authenticated browser/API session against local D1 was not exercised. |
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

## Before live can be reconsidered

1. Keep runtime live execution disabled. No live keys/accounts have been configured or approved.
2. Implement a real, independently reviewed strategy-level approver/expiry/revocation registry and fail-closed authorization; UI role checks alone are insufficient.
3. Implement injected, durable pre-trade policy checking: bounded sizing, portfolio and per-symbol exposure, loss/drawdown thresholds, fresh market data, synchronized exchange status/open orders/positions/balances, and persistent idempotency reservation.
4. Make audit append durable before dispatch; capture exchange acknowledgments and ambiguous outcomes; implement cancel/retry safety and reconciliation that blocks new orders whenever exchange/local state diverges.
5. Add adversarial/integration tests against a testnet with non-trading/read-only credentials first; separately review signature handling, key isolation/rotation, network/runtime compatibility, rate limits, clocks, and emergency kill controls. Testnet does not equal permission to trade production funds.
6. Obtain separate explicit user approval, account authorization, operational runbook, alerting, rollback plan, limits, and compliance/legal review. No approval or deployment was performed in this pass.

## Next steps

- For local development, run `npm run dev`; local D1 migrations were applied in this checkout with `npm run db:apply`. Sign in with a valid local account before using `/vi/operations` or `/en/operations`. API calls return `BLOCKED` (401/503) when auth or D1 is unavailable.
- Complete a browser/API integration check against local D1: create → reload → status transition → inspect audit event. Do not run `db:apply:remote`; remote D1 is intentionally untouched.
- Add workspace membership and roles to the operations API before allowing multiple OPC staff or customer workspaces.
- Add workspace membership and roles to the operations API before allowing multiple OPC staff or customer workspaces.
- Implement dedicated finance, marketing, sales, and support bounded contexts; the shared work queue is a first durable internal workflow, not a replacement for those products.
