# System Architecture — CashClaw Trade Bot

## Overview

Next.js 16 App Router application that renders the bilingual UI and serves user-facing APIs, deployed on Cloudflare Workers via OpenNext. A separate Hono worker entry (`src/worker.ts`) serves operator/internal routes and the cron eval trigger. All state persists to Cloudflare D1.

```
src/
├── tree/    Pure domain logic — no I/O (exchange providers, circuit breaker, quantlib)
├── forest/  Orchestration — API handlers, persistence, workflows (flight recorder audit ledger)
├── land/    Cross-cutting coordination
├── lib/     Shared primitives (db client, auth, crypto, logger, Result)
├── app/     Next.js App Router ([locale] pages + /api routes)
├── worker.ts  Hono entry — internal API + cron
├── middleware.ts  Session-cookie guard for Next.js API routes
```

## Layer Model

| Layer | Responsibility | Examples |
|---|---|---|
| `tree/` | Pure trading domain: bot state machine, strategy chain, exchange adapters (paper), telemetry writer | `tree/bot/`, `tree/exchange/`, `tree/telemetry/` |
| `forest/` | Orchestrates domain against infrastructure: D1 persistence/hydration, backtest engine, settings, monitoring, flight recorder, API handlers | `forest/bot/`, `forest/backtest/`, `forest/settings/`, `forest/api/` |
| `land/` | Coordinates across domains: bot management, exchange orchestration | `land/bot-management/`, `land/exchange-orchestration/` |
| `lib/` | Framework-agnostic primitives used by all layers | `lib/db/`, `lib/auth/`, `lib/crypto.ts`, `lib/logger.ts`, `lib/result.ts` |

Dependency direction is strict: pages → forest → tree; land coordinates forest+tree. Cross-layer imports are treated as contract seams — prefer existing imports over new couplings.

## Request Flows

**User-facing UI + API (Next.js App Router):**
1. `src/middleware.ts` guards sensitive API routes (`/api/bots`, `/api/settings`) — validates the `session_id` cookie against D1 `user_sessions`, strips client-supplied `x-user-id`.
2. Page components under `src/app/[locale]/` are server components that read D1 (or hydrate `BotManager`), passing data to `*Client` components.
3. Mutations use Server Actions (`src/forest/.../actions.ts`) or `POST` routes validated with Zod.

**Operator/internal API + cron (Hono worker, `src/worker.ts`):**
- `/internal/api/bots/*`, `/api/killswitch/*`, `/api/events`, `/api/stats/daily`, `/api/cron/eval`, `/api/health`, `/api/version`.
- Bearer-token auth via `forest/api/auth-guard.ts`.

## D1 Schema

Migrations in `migrations/` (`0001_initial_schema.sql` … `0009_research_registry.sql`):

| Table | Purpose |
|---|---|
| `users` | User accounts (email, display name, passcode hash) |
| `bots` | Bot definitions + current state snapshot (config_json, pnl, counts, status) |
| `trades` | Closed-trade history |
| `api_credentials` | Exchange credentials (encrypted at rest) |
| `trade_events` | Append-only event/telemetry log per bot |
| `capital_snapshots` | Time-series of capital/P&L for dashboards |
| `audit_log` | User+bot audit trail |
| `killswitch_audit` | Killswitch halt/resume event history |
| `user_sessions` | Session tokens (id, expires_at) |
| `settings` | Exchange creds JSON, risk limits, killswitch state, notification config |

Apply migrations locally with `npm run db:apply`, remotely with `npm run db:apply:remote`.

## Key Patterns

- **Result type** (`lib/result.ts`) — explicit `ok`/`err` outcomes instead of thrown errors across domain logic.
- **Canonical JSON** (`lib/canonical-json.ts`) — deterministic serialization for hashing and audit entries; used by the audit ledger and telemetry writer.
- **ProviderChain** (`tree/exchange/provider/provider.ts`) — primary/fallback exchange routing with per-attempt provenance (provider, latency, circuit state). Max 1 fallback.
- **CircuitBreaker** (`tree/exchange/provider/circuit-breaker.ts`) — 4-state breaker (`closed | degraded | open | half_open`) with kind-aware thresholds per `FailureKind` (timeout, rate_limit, server_error, network, unknown). State-change callback fires on every transition.
- **Audit ledger** (`forest/flight-recorder/audit-ledger.ts`) — hash-chained append-only telemetry entries using SHA-256 over canonical JSON payloads.
- **Quantlib** (`tree/quantlib/`) — mathematical function registry for strategy composition (Phase 01 stub).
- **BotManager** — in-memory registry of `BotInstance`s hydrated from D1; monitoring/detail flows read D1 directly to avoid per-request hydration dependency on cold-start state.
- **Killswitch** — emergency halt persisted to D1 daily state so it survives Workers cold starts.
- **Logger** (`lib/logger.ts`) — structured, level-filtered logging; replaces `console.*` everywhere.
- **Flight recorder** — durable per-bot telemetry feed for dashboards and trade history.

## Alpha Research OS (Phase 1)

Research-side modules that make every hypothesis, feature, experiment, and kill a machine-readable, reproducible, lineage-tracked artifact. Zero execution-path changes — gates, killswitch, and promotion state machine are untouched.

| Module | Layer | Role |
|---|---|---|
| `tree/alpha/registry/` | tree | Immutable research registry: entries carry hypothesis, data sources, feature set, periods, costs, seed, git commit, result, falsification reason, status. Seeded with the 30 falsified classes so dead hypotheses are machine-guarded |
| `tree/alpha/hypothesis/lineage.ts` | tree | Hypothesis provenance graph (parent/mutation links, cycle rejection, dead-end detection) with a bridge into the registry |
| `tree/alpha/microstructure/` | tree | 9 causal microstructure feature contracts declared through `declareFeature()`; missing data stays `null` (never forward-filled). Contracts only — no data fetching |
| `tree/alpha/universe/` | tree | Cross-sectional universe: ranking, percentile normalization, long/short selection, market-neutral and basket-neutral weights |
| `tree/regime/transition-matrix.ts` | tree | 7×7 `P(regime[t+1] \| regime[t])` from consecutive observed pairs, plus persistence, entropy, duration, hazard statistics |
| `forest/alpha/experiments/` | forest | Additive experiment metadata: lineage links plus `experimentHash` (SHA-256 over canonical JSON of config+seed+gitCommit) and `falsificationReason` |
| `forest/alpha/persistence/` + `migrations/0009` | forest | Append-only `research_registry` / `research_hypotheses` D1 tables; registry + lineage methods on the D1 and JSON adapters |

Layering follows the existing contract: all pure domain logic lives in `tree/` (no I/O); `forest/` owns the D1 persistence adapters and the experiment runner metadata; `land/` and the execution path are unchanged.

## Auth

- Session-cookie auth for user APIs (login → `user_sessions` row → `session_id` cookie).
- Bearer-token auth for operator worker routes.
- Exchange credentials encrypted at rest (`lib/crypto.ts`); API responses mask secrets.
- Fail-closed: if D1 is unavailable, sensitive routes reject rather than degrade open.

## i18n

Bilingual Vietnamese (default) + English via `next-intl`, locale segment `[locale]` at the app root. Messages in `src/messages/` (vi.json, en.json). All customer-facing text goes through `useTranslations` / `t()`.
