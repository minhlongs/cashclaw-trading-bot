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

Layered architecture under `src/`:

- **`tree/`** — pure domain logic (bot state machines, strategy chain, exchange adapters, telemetry)
- **`forest/`** — orchestration (API handlers, D1 persistence/hydration, backtest engine, settings, monitoring, flight recorder)
- **`land/`** — cross-cutting coordination (bot management, exchange orchestration)
- **`lib/`** — shared primitives (D1 client, auth, crypto, logger, Result type)

App routes live under `src/app/[locale]` with global middleware that validates session cookies for sensitive API routes. Worker entry at `src/worker.ts` serves operator/internal endpoints with Bearer-token auth.

See `docs/system-architecture.md` for the full model, D1 schema, and request flows.

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
