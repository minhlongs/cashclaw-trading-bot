# CashClaw AI Trading Bot Platform

Next.js 16 App Router platform for AI-driven trading workflows, deployed to Cloudflare Workers via Wrangler/OpenNext. Bilingual UI (Vietnamese default + English) through `next-intl`. **v1 scope: paper-trading only** — simulated exchange, no real money.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Runtime:** Cloudflare Workers (OpenNext), Hono for the worker entry
- **Database:** Cloudflare D1 (SQLite-backed), migrations in `migrations/`
- **Testing:** Vitest + React Testing Library + jsdom
- **Trading:** ccxt types, paper exchange simulator, strategy chain (grid / mean-reversion)

## Quick Start

```bash
npm install
npm run dev          # dev server (local D1 via wrangler)
npm run db:apply     # apply D1 migrations locally
npm test             # vitest suite
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (type-checked) |
| `npm run lint` | ESLint (zero-warning gate) |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run db:generate` | Create local D1 migration |
| `npm run db:apply` / `db:apply:remote` | Apply migrations locally / remote |
| `npm run deploy` | Build + deploy with OpenNext/Wrangler |

## Architecture Overview

Layered Open-Core architecture under `src/`:

- **`tree/`** — **Apache-2.0 Open-Core:** pure domain logic (60+ `quantlib` volatility/microstructure/liquidity/execution engines, 17-op Alpha Zoo AST parser/evaluator, OHLCV quality gates, bot state machines, strategy chain, paper exchange simulator)
- **`land/`** — **Apache-2.0 Open-Core:** cross-cutting single-user coordination (bot management, exchange orchestration)
- **`forest/`** — orchestration (API handlers, D1 persistence/hydration, backtest engine, multi-agent TradingAgents deliberation, settings, monitoring, flight recorder)
- **`ee/`** — **CashClaw Commercial License (`src/ee/LICENSE-COMMERCIAL.md`):** Multi-tenant workspace RBAC, 24/7 Cloud Scheduler lease coordinator, Managed LLM Credit Ledger, Curated Cloud Alpha Feed, NOWPayments Crypto IPN billing (`BASIC | PREMIUM | ENTERPRISE | MASTER`), and 1-Click Local-to-Cloud Sync Bridge
- **`lib/`** — shared primitives (D1 client, edition detector `OSS_LOCAL` vs `CLOUD_SAAS`, auth, crypto, logger, Result type)

App routes live under `src/app/[locale]` with global middleware that validates session cookies for sensitive API routes. Worker entry at `src/worker.ts` serves operator/internal endpoints with Bearer-token auth.

See `docs/system-architecture.md` and `docs/open-core-saas-architecture.md` for the full model, licensing boundary, D1 schema, and request flows.

## Self-Hosted OSS (`Apache-2.0`) vs CashClaw Cloud SaaS (`EE`)

| Feature | Self-Hosted OSS (`OSS_LOCAL`) | CashClaw Cloud SaaS (`BASIC / PREMIUM / ENTERPRISE / MASTER`) |
|---|---|---|
| **License** | Apache-2.0 (`LICENSE`) | CashClaw Commercial (`src/ee/LICENSE-COMMERCIAL.md`) |
| **QuantLib & Alpha Zoo SDK** | 100% Free & Open Source | Included + Hourly Pre-computed Cloud IC/IR Feed |
| **Paper-Trading Execution (`ADR-001`)** | Local CLI / Local Worker | 24/7 Managed Cloudflare Workers + D1 Persistence |
| **Multi-Agent LLM Deliberation** | Bring Your Own Key (BYOK) | BYOK (`BASIC`) or Managed Cloud LLM Pool (`PREMIUM+`) |
| **1-Click Local-to-Cloud Sync** | Export signed SHA-256 bundle | Verify & import into 24/7 Cloud Bot Slot |

## Quality Gates

- `npm run build` — 0 TypeScript errors
- `npm test` — full suite green (1600+ tests)
- Zero `:any` types in production code
- Zero `console.log`/`warn`/`error` — use the logger utility
- ESLint suppression count never increases (baseline frozen)
- Zod validation on all API inputs
- Server Actions for data mutations

See `docs/code-standards.md` for the full conventions (canonical imports, naming, banned patterns).

## Documentation

- `docs/customer-setup-guide.md` — bilingual user guide (🇻🇳 / 🇬🇧)
- `docs/system-architecture.md` — layer model, D1 schema, request flows
- `docs/code-standards.md` — naming, imports, quality gates
- `docs/development-roadmap.md` — completed phases and v2 backlog
- `docs/project-changelog.md` — milestone record with commit references
