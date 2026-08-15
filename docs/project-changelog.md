# Project Changelog — CashClaw Trade Bot

## v1 Paper-Trading Platform

### Core Platform
- Next.js 16 App Router scaffold, bilingual i18n (vi/en), D1 schema (users/bots/trades/events/snapshots), paper exchange simulator, grid + mean-reversion strategy chain.

### Data Integrity — Commit `e8228b5`
- Dashboard, bots, and bot-detail pages now read real data from D1 (`trade_events`, `capital_snapshots`). Fabricated figures removed.

### Auth + Trade Events — Commits `363db6d`, `3afc1e9`
- Session-cookie authentication with D1 `user_sessions`. Trade event telemetry wired to flight recorder.

### Security Hardening — Commit `7e4cb92`
- CORS domain restriction (no more wildcard `origin: '*'`). Middleware session validation against D1. Backtest wiring fixed. Notification persistence wired.

### Fail-Closed Auth — Commit `f1c0949`
- Sensitive routes reject when D1 is unavailable. Spoofable `x-user-id` header stripped in middleware.

### Monitoring — Commit `69e683a`
- Real health, metrics, and killswitch cards from D1. In-memory BotManager reads dropped in favor of direct D1 queries.

### Killswitch Durability — Commit `ab7424c`
- Daily halt state persisted to D1 so it survives Workers cold starts.

### Credential Encryption — Commit `cae6dbd`
- Exchange credentials encrypted at rest. Secrets masked in API responses.

### Bot Detail Hydration — Commit `16c6f45`
- Bot detail and control handlers hydrate from D1 before serving.

### E2E Smoke Tests — Commit `bfa4697`
- Customer-journey API smoke tests covering auth, bot lifecycle, settings, and monitoring flows.

### Quality Push (Phase L) — Commit `1a2cd16`
- ESLint: 86 → 0 warnings. Coverage: 75% → 87.5% (statements), 1628 tests across 122 files. Coverage thresholds ratcheted (statements 80, branches 85, functions 85, lines 80). Follow-up type-fix commit `ffb81a8`.

### Backtest Wiring — Commit `9f5bd1f`
- Backtest page now loads real bots from D1 into the selector (was always empty).

### Project Documentation — Commit `d44abdb`
- README.md, system architecture, code standards, development roadmap, project changelog. Lint tightened to zero-warning gate (`--max-warnings 0`).

### i18n Consolidation — Commit `0a1b5c9`
- 18 source files migrated from manual bilingual patterns (labelVi/labelEn, isEn ternaries, inline t(vi, en) helpers, hardcoded strings) to `useTranslations()` from next-intl. All customer-facing strings now flow through vi.json/en.json (244 keys, in sync). Protected wizard flow logic untouched. Dead page.constants.ts removed.

### Rate-Limit Fix — Commit `78b29d0`
- Added `ok: false` to rate-limit responses in `POST /api/bots` and `POST /api/settings` — was returning bare `{ error }` without the documented `ok` field.

### Dead Code Cleanup — Commit `54973ea`
- Wizard `FIELD_KEY_MAP` and `STRATEGY_KEY_MAP` deduplicated into `wizard-types.ts`. Empty barrel `strategies/index.ts` removed.

### Dependency Modernization (Phase R) — Commit `83cc365`
- Pinned 13 packages to exact versions: `next` 16.2.10 → 16.3.1, `react`/`react-dom` 19.2.7 → 19.2.8, `next-intl` 4.13.2 → 4.13.6, `hono` 4.12.30 → 4.13.2, `vitest`/`@vitest/coverage-v8` 3.2.4 → 3.2.7, `wrangler` 4.122.0 → 4.123.0, `lightweight-charts` 4.2.0 → 4.2.3, `@types/react` 19.2.17 → 19.2.18, `@types/react-dom` 19.2.3 → 19.2.4. Resolved pre-existing `@opennextjs/cloudflare` peer dependency violation (`next>=16.2.11` required, was at 16.2.10). All gates pass (1635 tests, 0 lint, 0 TS errors, build clean). 7 major-version upgrades deferred (eslint, vitest, zod, typescript, lightweight-charts, lucide-react, @types/node).

### Killswitch Defense-in-Depth — Commit `42eb237`
- Restored killswitch guard at top of `executeOrder` (executor-level defense-in-depth). Prevents future direct callers of `executeOrder` from bypassing the BotInstance-level killswitch. Two tests added.

### Phase T: Make Gates Real — Commit `c8b5b7f`
- T1: Fixed flaky `strategy-settings.test.tsx` save tests (deferred resolve handle instead of 100ms setTimeout; 5/5 consecutive runs verified green).
- T2: Wired coverage into CI (added `test:coverage` script, coverage step in ci.yml, scoped `coverage.include` to `src/`). Actual coverage: 89.21% statements / 88.65% branches. Deprecated `environmentMatchGlobs` still in place — deferred to later phase.
- T3: Deleted 12 no-op `eslint-disable` suppressions; added `reportUnusedDisableDirectives: 'error'` to enforce immutability per Phase M suppression-freeze rule.
- T4: Removed 3 dead-code items: `src/land/bot-management/` (0 external importers), `src/tree/exchange/index.ts` barrel, `resetAllBots()` in settings/actions.ts + 3 orphan tests.

### Orchestrator Wiring (Phase S) — Commit `c0cb35a`
- ExchangeOrchestrator wired into BotManager/BotInstance/bot-tick/bot-order-executor as optional first-choice execution path, with raw adapter fallback. Duplicate killswitch guard removed from bot-order-executor (BotInstance-level guard preserved as defense-in-depth). 2 executor-level killswitch tests removed.

### ExchangeOrchestrator Result<T> — Commit `2b2308a`
- 6 public methods (fetchTicker, fetchOrderBook, placeOrder, cancelOrder, fetchOrder, fetchBalances) now return `Result<T>` instead of throwing. Killswitch/circuit-breaker paths return `err()`. 7 type-guard tests added for `hasStrategyChain`, `isGridConfig`, `isMeanRevConfig`. V2 wiring documented.

### Phase V: Dead Code Removal — Commits `514bf30`, `e2d19aa`
- Deleted `src/tree/bot/create-bot.ts` + 3 associated test files (415 lines) plus orphan `quality-gates.json`. All had 0 production importers. Flaky `setState-after-teardown` race fixed in 7 client components by adding `cancelled` flag + `useEffect` cleanup (verified 10/10 consecutive runs green).

### Phase VI: Layer Violation Fix — Commit `8e4c85f`
- Eliminated BotManager dependency on `land/exchange-orchestration` by re-exporting `ExchangeOrchestrator` type from `tree/bot/bot-manager-types.ts` and importing from the local tree boundary instead. `patchBot` remains via `tree/bot/bot-manager-helpers.ts` indirection (which already imports from `forest`).

### Killswitch Guard Restored — Commit `6c658e2`
- Restored killswitch guard at top of `bot-order-executor.ts` `executeOrder()` as defense-in-depth. Tests updated to cover halt path.

### Flaky Test Fixes — Commit `66568b8`
- Fixed deferred resolve handle in `strategy-settings.test.tsx` (eliminated 100ms setTimeout race). Added missing `await` in `client-extended.test.ts` async rejection test.
