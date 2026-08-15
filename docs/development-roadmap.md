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
| Phase Q orchestrator | ExchangeOrchestrator 6 methods → Result<T>, type-guard tests added, v2 wiring documented | commit `2b2308a` |
| Phase O rate-limit | Fixed ok:false missing in bots/settings rate-limit responses | commit `78b29d0` |
| Phase P dead code | Wizard maps deduplicated, empty barrel removed | commit `54973ea` |
| Phase Q orchestrator | ExchangeOrchestrator 6 methods → Result<T>, 7 type-guard tests, v2 wiring documented | commit `2b2308a` |

## Current State

- **Tests:** 1628 across 122 files, full suite green
- **Coverage:** statements 87.5%, branches 89.2%, functions 90.2%, lines 87.5% (thresholds 80/85/85/80)
- **Lint:** 0 ESLint warnings (enforced via `--max-warnings 0`)
- **TypeScript:** 0 errors on `tsc --noEmit`
- **Build:** clean

## Known Backlog (v2 and beyond)

- **BotManager hydration architecture** — replace in-memory registry + per-request hydration with a cold-start-resilient store (Durable Objects or direct-D1 reads everywhere).
- **Queue drain wiring** — request queue exists; drain/cron wiring deferred.
- **Cross-exchange routing** — routing across binance/bybit/okx at runtime.
- **Live exchange** — CCXT on Workers feasibility is unresolved; requires D1 provisioning, live engine wiring, and explicit customer opt-in.
- **Coverage tail** — 87.5%→90% possible (page-client, LandingClient, CtaClient) but low signal for v1; revisit after more business-logic tests.

## Conventions

- Every task runs through the orchestration pipeline (plan → gate → execute → verify → SHIP) before committing.
- Conventional commit messages, no AI references or phase labels in messages.
