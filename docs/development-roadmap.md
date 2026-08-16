# Development Roadmap — CashClaw Trade Bot

## Scope

**v1: Paper-trading only.** Simulated exchange, no real money. Live trading is a separate v2 milestone gated on CCXT-on-Workers feasibility and explicit customer opt-in.

## Completed Phases

| Phase | What shipped | Evidence |
|---|---|---|
| Core platform | Next.js App Router scaffold, bilingual i18n, D1 schema (users/bots/trades/events/snapshots), paper exchange, grid + mean-reversion strategy chain | `migrations/0001` |
| Data integrity | Dashboard/bots/bot-detail read real data from D1 (`trade_events`, `capital_snapshots`) — fabricated figures removed | commit `e8228b5` |
| Auth + trade events | Session-cookie auth, D1 `user_sessions`, trade event telemetry wired | commits `363db6d`, `3afc1e9` |
| Security (Phase F) | CORS domain restriction, middleware session validation, backtest wiring, notification persistence | commit `7e4cb92` |
| Fail-closed auth | Reject when D1 unavailable; strip spoofable `x-user-id` header | commit `f1c0949` |
| Monitoring | Real health/metrics/killswitch cards from D1; in-memory BotManager reads dropped for D1 | commit `69e683a` |
| Go-live readiness | Expanded health route with circuitBreaker + rateLimiter probes; deploy runbook created | docs/deploy-runbook.md |
| Killswitch durability | Daily halt state persisted to D1 to survive Workers cold starts | commit `ab7424c` |
| Credential encryption | Exchange credentials encrypted at rest; secrets masked in API responses | commit `cae6dbd` |
| Bot detail hydration | Bot detail + control handlers hydrate from D1 before serving | commit `16c6f45` |
| E2E smoke | Customer-journey API smoke tests | commit `bfa4697` |
| Phase L quality | ESLint 86→0 warnings; coverage 75%→87.5%; 1628 tests; thresholds ratcheted | commit `1a2cd16` |
| Backtest wiring | Backtest page loads real bots from D1 into selector (was empty) | commit `9f5bd1f` |
| Phase M docs | README + architecture/code-standards/roadmap/changelog; lint zero-warning gate | commit `d44abdb` |
| Phase N i18n | 18 files migrated to useTranslations(); vi.json/en.json 244 keys synced | commit `0a1b5c9` |
| Phase O rate-limit | Fixed ok:false missing in bots/settings rate-limit responses | commit `78b29d0` |
| Phase P dead code | Wizard maps deduplicated, empty barrel removed | commit `54973ea` |
| Phase Q orchestrator | ExchangeOrchestrator 6 methods → Result<T>, 7 type-guard tests, v2 wiring documented | commit `2b2308a` |
| Phase R deps | 13 packages pinned exact (next 16.3.1, react 19.2.8, vitest 3.2.7, etc.); @opennextjs/cloudflare peer dep satisfied | commit `83cc365` |
| Phase S orchestrator wiring | ExchangeOrchestrator wired into bot execution path; duplicate killswitch guard restored in executor as defense-in-depth | commit `30a5a13` |
| Phase T make gates real | Flaky test race fixed (5/5 green), coverage gate wired (89.21%/88.65%), 12 dead eslint-disable suppressions removed + enforcement, 3 dead-code modules removed | commit `c8b5b7f` |
| Phase U.1 orchestrator Result | ExchangeOrchestrator 6 methods → Result<T>, 7 type-guard tests | commit `6c658e2` |
| Phase U.2 wizard config | Wizard config pass-through wired: config record accepted by Zod, coerceNum helper, bot-create handler honors spacing_pct/grid_levels/drawdown | commit `b18ca86` |
| Phase V dead code | Deleted create-bot.ts + 3 tests + quality-gates.json + bot-management/ module (556 lines). Flaky test fixes in 7 client components (setState-after-teardown) | commits `514bf30`, `e2d19aa` |
| Phase VI layer fix | Eliminated BotManager layer violation: ExchangeOrchestrator type re-exported from tree/bot/bot-manager-types.ts | commit `8e4c85f` |
| Phase VII queue drain cron | CF Cron trigger fires every 5 minutes to drain exchange request queues; worker.ts scheduled() handler wired with logger; wrangler.jsonc triggers.crons added; duplicate-imports lint issue fixed via consolidated type+value import | commit `ddb0309` |
| **P0.4 — Canonical JSON + error normalizer** | `src/lib/canonical-json.ts` deterministic serialization; exchange error normalizer for consistent classification | commit `03fbabc` |
| **P0.5 — 4-state CircuitBreaker** | `circuit-breaker.ts` with `closed \| degraded \| open \| half_open` states; kind-aware thresholds per `FailureKind` in `circuit-breaker-kinds.ts`; state-change callback wired into all transitions | commits `96d937a`, `5e31701` |
| **P0.6 — ProviderChain + provenance** | `src/tree/exchange/provider/provider.ts` primary/fallback routing with per-attempt provenance record; max 1 fallback attempt | commit `26734ef` |
| **P0.7 — Killswitch audit trail + credential barrier** | D1 migration `0007_killswitch_audit_trail.sql`; `validateStartCredentials()` pre-check scoped to bot owner; hash-chained audit ledger (`audit-ledger.ts`); safe D1 detail serializer (`serialize-detail.ts`) | commits `404b665`, `48425a5`, `253659f` |

## Current State

- **Tests:** 1588 across 119 files, full suite green
- **Coverage:** statements 89.06%, branches 88.72%, functions 90.66%, lines 89.06% (thresholds 80/85/85/80)
- **Lint:** 0 ESLint warnings (enforced via `--max-warnings 0` + `reportUnusedDisableDirectives: error`)
- **TypeScript:** 0 errors on `tsc --noEmit`
- **Build:** clean

## Known Backlog (v2 and beyond)

- **BotManager hydration architecture** — replace in-memory registry + per-request hydration with a cold-start-resilient store (Durable Objects or direct-D1 reads everywhere).
- **Cross-exchange routing** — routing across binance/bybit/okx at runtime.
- **Live exchange** — CCXT on Workers feasibility is unresolved; requires D1 provisioning, live engine wiring, and explicit customer opt-in.
- **Coverage tail** — 87.5%→90% possible (page-client, LandingClient, CtaClient) but low signal for v1; revisit after more business-logic tests.

## Conventions

- Every task runs through the orchestration pipeline (plan → gate → execute → verify → SHIP) before committing.
- Conventional commit messages, no AI references or phase labels in messages.