# Project Changelog — CashClaw Trade Bot

## v1 Paper-Trading Platform

### ProviderChain Wiring — 2026-08-19
- **Wired ProviderChain into ExchangeOrchestrator** — `fetchTicker` and `placeOrder` now route through `ProviderChain` instead of calling `PaperExchangeProvider` directly, enabling future failover + provenance tracking.
- **Interface fix (Phase 0):** `TickerProvider.fetchTicker` / `OrderProvider.placeOrder` changed from returning `ProviderResult<T>` to raw `Promise<Ticker>` / `Promise<OrderResult>`. This eliminates a double-wrap bug where `ProviderChain.execute` would produce `ProviderResult<ProviderResult<Ticker>>`.
- **New `PaperProviderAdapter`** (`src/tree/exchange/provider/paper-provider-adapter.ts`) bridges `PaperExchangeProvider` to `TickerProvider & OrderProvider` — exposes `name`, `circuitBreaker`, `healthCheck()`, and delegates `fetchTicker`/`placeOrder` with the exchangeId bound. Added `getCircuitBreaker()` getter to `PaperExchangeProvider`.
- **Provenance propagation:** new `getLastProvenance(exchangeId)` accessor on `ExchangeOrchestrator` returns the last `ProviderResult` metadata (provider name, latencyMs, circuitState) after any chain-backed call.
- **Error reporting preserved:** `reportError` is called when `chainResult.ok === false` (the C3 gap from the plan).
- **YAGNI:** `fetchOrderBook`, `cancelOrder`, `fetchOrder`, `fetchBalances` remain direct provider calls — ProviderChain only supports ticker + order methods.
- **Quality gates:** 1892/1892 tests pass, lint 0 warnings, `tsc --noEmit` clean, `npm run build` clean.
- **Files:** `provider.ts`, `paper-provider.ts`, `paper-provider-adapter.ts` (new), `provider/index.ts`, `exchange-orchestration/index.ts`, `exchange-orchestration/index.test.ts`, `exchange-orchestration/orchestration-extended.test.ts`, `paper-provider-adapter.test.ts` (new).

### Production Deploy (Go-Live) — 2026-08-19
- **Deployed to Cloudflare Workers:** `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev`. Paper-only — no real orders, no live capital. Preceded by the falsification campaign NO-GO, so the platform ships as a research/paper system.
- **Deploy runbook fixed:** referenced nonexistent `npm run deploy:worker` → corrected to `npm run deploy` (the real script that injects `GIT_COMMIT_SHA` + `BUILD_TIMESTAMP` and runs OpenNext build + deploy).
- **KV binding checklist removed:** runbook asked for a KV binding that no longer exists in `wrangler.jsonc`. `CACHE` is declared optional in `src/lib/db/types.ts` but never read at runtime. Checklist now documents actual required secrets/vars.
- **`.env.example` added** (was missing entirely). Documents `ADMIN_TOKEN`, `ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, `VERSION`, `GIT_COMMIT_SHA`, `BUILD_TIMESTAMP`, `NODE_ENV`. Un-ignored in `.gitignore` (the `.env.*` glob was catching it).
- **Pre-deploy gates:** type-check clean, lint 0 warnings, build clean, 1880/1880 tests pass.
- **Post-deploy smoke:** `/api/health` → `status: "ok"` with `db`/`circuitBreaker`/`rateLimiter` all `"ok"`; `/api/version` reports `shortSha: 00c81b3f`; `/api/killswitch-status` and `/api/metrics` return 200.
- **Open item:** `ENCRYPTION_KEY` secret unset on Cloudflare. Not a data-loss risk today (`api_credentials` is empty; `getEncryptionKey()` falls back to plaintext), but must be set before any customer stores credentials.

### Code Review Fix — Commit `c99791a`
- **Vietnamese checklist aligned with English.** Code review returned CONDITIONAL PASS: the Vietnamese section of `docs/deploy-runbook.md` still listed a KV binding that does not exist in `wrangler.jsonc`, contradicting the English fix. Aligned to D1 binding, `ALLOWED_ORIGINS` var, `ADMIN_TOKEN` secret, `ENCRYPTION_KEY` secret with the same "no KV binding" rationale. Review criteria (a)–(f) now all PASS.

### Alpha Discovery Campaign — Complete (2026-08-18)
- **Falsification campaign concluded:** 24 hypothesis classes tested across TA, funding rates, ML regime detection, cross-asset pairs, sentiment, composites, and market-structure signals. **Zero persistent out-of-sample positive expectancy.**
- **Walk-forward validation** (`funding-price-extreme-walkforward.ts`): 6 rolling windows (548d train / 182d test), 162 OOS tests, 1,032 total OOS trades. Last candidate (funding × price extreme interaction) scored 10/162 OOS passes (6%), aggregate PnL -$455,090 — regime-locked to mid-2022 bear market, pure overfitting.
- **Definitive report:** `docs/falsification-report.md` — methodology, results by signal class, data limitations, and implications for platform design.
- **Roadmap updated** to reflect campaign completion and the gate on new data infrastructure for future alpha research.

### Quality Gate Restoration — Commits `ac4b5ff`, `f0b0ce7`, `e113f39`, `ec53022`
- **Archival bug fixed:** 48 files deleted from the working tree but still tracked in HEAD were breaking knip (its `src/**/*.ts` glob scans deleted-but-tracked files). Moved them into tracked `archive/falsification/` — knip's project glob excludes `archive/`, so they no longer register as dead source. Verified byte-identical to HEAD versions before moving. (`f0b0ce7`)
- **Knip cleanup:** removed 5 stale `ignoreFiles` entries (`demo.ts`, `regime-backtest-types.ts`, `regime-backtest.ts`, `paper-simulator.ts`, `real-data-runner.ts`) whose targets now live in `archive/` and were producing Configuration hints. Added `ignoreIssues` entries for 6 exports only referenced by archived code. (`f0b0ce7`)
- **Dead code removed:** `src/forest/alpha/evaluator/data-fetcher.ts` — an unwired stub with zero references, zero tests, zero callers. Deleted the directory. (`f0b0ce7`)
- **Archive cleanup:** `e113f39` deleted the `src/` copies of the 48 files already archived in `f0b0ce7`, so the working tree no longer retains duplicate dead source.
- **tsc alignment:** `archive/` added to `tsconfig.json` exclude so archived files don't block `tsc --noEmit`. (`ec53022`)
- **Result:** `npm run quality:gate` exits 0 (type-check + lint + coverage + knip). Test count 1588 → 1880.
- **Real-data backtest script:** `scripts/alpha-real-data-backtest.ts` added — fetches live Binance OHLCV plus all four derivative sources (funding, OI, liquidations, premium) and runs the full `AlphaResearchPipeline`. Verified end-to-end. All four `/fapi/v1/*` endpoints return HTTP 403 from this environment; the script degrades gracefully to empty features and reports honestly, so a Binance outage never aborts a research run. Aligned with current `RegimeConfig`/`WindowConfig`/`Logger` signatures. (`ac4b5ff`, `ec53022`)

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

### Go-Live Readiness — health route + deploy runbook
- `/api/health` expanded with `circuitBreaker` and `rateLimiter` probes; response keeps `status` as `ok | degraded`, DB + CB determine overall status, rateLimiter is informational only.
- `documentation-management.md` protocol followed: roadmap and changelog updated post-feature.
- Deploy runbook added: pre-deploy checks, deploy steps, post-deploy smoke tests, rollback procedure, emergency contacts (bilingual VN+EN).
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

### Phase VII: Queue Drain Cron — Commit `26a510a`
- Wired CF Cron `scheduled()` handler in `src/worker.ts` to drain all exchange request queues every 5 minutes via `BotManager.drainQueues()`. Replaced raw `console.log` with `createLogger('cron')` to satisfy `no-console` rule. Fixed duplicate-imports lint in `src/tree/bot/bot-manager.ts` by consolidating type-only + value imports from `bot-manager-types.ts` into a single inline-typed statement. Changed `toD1Status` export in `bot-manager-types.ts` to arrow function so value re-export coexists with `export type` without duplicate-imports warnings. Added `triggers.crons` to `wrangler.jsonc`. Gates: 0 lint warnings, 0 TS errors, 1588/1588 Vitest tests pass.

### P0: Exchange Resilience Batch — Commits `26734ef`, `48425a5`, `404b665`, `96d937a`, `5e31701`, `253659f`

- **ProviderChain with provenance** (`src/tree/exchange/provider/provider.ts`): primary/fallback routing with per-attempt `provenance` record (provider name, latencyMs, circuitState). Max 1 fallback attempt.
- **Hash-chained audit ledger** (`src/forest/flight-recorder/audit-ledger.ts`): append-only telemetry entries with SHA-256 chain. Uses `canonicalize()` from `src/lib/canonical-json.ts` for deterministic serialization before hashing.
- **4-state CircuitBreaker** (`src/tree/exchange/provider/circuit-breaker.ts`): states `closed | degraded | open | half_open`. State-change callback fires on every transition for observability wiring.
- **Kind-aware thresholds** (`src/tree/exchange/provider/circuit-breaker-kinds.ts`): per-`FailureKind` (timeout, rate_limit, server_error, network, unknown) independent threshold/cooldown pairs. `classifyFailure()` infers kind from error message regex.
- **Killswitch audit trail**: D1 migration `0007_killswitch_audit_trail.sql`. Killswitch halt/resume events written to `killswitch_audit` table.
- **Bot credential pre-validation**: `validateStartCredentials()` in `src/forest/api/handlers/bot-control.ts` checks exchange API keys exist before starting a bot. Scoped to bot owner via `getBotOwnerId()`.
- **Safe D1 detail serializer** (`src/forest/api/handlers/serialize-detail.ts`): strips non-serializable D1 columns from bot detail responses.
- **Rate limiter hardening**: added `ok: false` to rate-limit responses missing it; exchange error normalizer added for consistent error classification.

### Non-TA Market-Structure Alpha Layer — Commits `52d9ef9`, `7a1c8c2`
- **Four Binance public signal sources** (`src/tree/alpha/signals/`): funding rate, open interest, liquidation cascade, and basis (premium index). No auth required.
- **Causal feature computation**: `computeDerivativeFeatures` consumes only source points with `timestamp <= candle.timestamp`. Liquidation lookback window derived from actual candle spacing (not a hardcoded 4h assumption). Z-scores computed against a rolling mean, never against zero.
- **Signal aggregation with a 1.5x vote margin**: `generateDerivativeSignals` requires a 1.5x confidence-weighted margin between long and short camps before emitting a non-neutral signal. Requires a non-empty `symbol` — throws rather than emit `symbol: ''`.
- **Pipeline wiring**: `fetch_derivatives` step runs between `fetch_data` and `compute_indicators`. Network failures are non-fatal; the step falls back to empty features so a Binance outage never aborts a research run. Each source is fetched independently and its failure is logged.
- **Deterministic offline testing**: `derivatives?: DerivativeData` injection point on `PipelineConfig` lets the derivative alpha path be exercised without live Binance access.
- **Cache safety**: `cache.ts` reuses the path-safety pattern from `ohlcv-cache.ts` — `realpathSync` guard rejects keys that resolve outside `.cache/derivatives/`, and caching is disabled under test.
- **Code-review remediation** (`7a1c8c2`): fixed silent NaN in OI notional (Binance OI history has no price field), empty-string symbol misattribution, phantom injection test, and dead `fetchPremiumIndex` (now wired into basis computation).
- **Known limitation**: all four `/fapi/v1/*` endpoints return HTTP 403 from this environment; only spot endpoints return 200. Derivative fetchers are untested against live data.

### Alpha Lab Phase 3–4: Causal Regime Engine + Feature Declaration — Commit `TBD`
- **Future-data leakage tests** (`src/tree/regime/leakage.test.ts`, 6 tests): extracts regime features at a fixed historical index and proves the result is invariant to everything after that index, including an injected crash/spike. Catches a leaky classifier that peeks at the next candle's close or a volume spike that hasn't happened yet.
- **`atIndex` parameter on `extractRegimeFeatures`** (defaults to last candle): lets callers extract features for any historical point, which is what makes causality testable at arbitrary indices instead of only at the end of the series.
- **Feature declaration contract** (`src/tree/alpha/indicator-types.ts`): every feature now declares `name`, `timeframe`, `source`, `lookback`, `availability`, and `causal`. `declareFeature()` validates all six and **rejects any non-causal feature** with an explicit error, so look-ahead bias cannot enter a feature vector, label, regime classification, or execution decision through this path.
- **`FeatureSource` / `FeatureAvailability` types**: `ohlcv` / `derivatives` / `orderbook` / `trades` / `synthetic`; `always` / `when_listed` / `when_derivatives_listed`.
- **OHLCV indicators** (`src/tree/alpha/indicators.ts`) now emit `source: 'ohlcv', availability: 'always'` on every result envelope.

### Alpha Lab Phases 5–10: Evaluation Engine + Hypothesis Sweep — Commit `6fa3a1d`
- **Evaluation engine** (`src/forest/alpha/evaluation/`): full strategy evaluation report with Sharpe, Sortino, profit factor, expectancy, max drawdown, fees, exposure, regime/month/volatility/trade-duration breakdowns.
- **Hypothesis sweep** (`src/forest/alpha/hypothesis-sweep.ts`): parameter grid search over RSI + filter combinations, ranked by expectancy with bootstrap p-values.
- **Baselines** (`src/forest/alpha/baselines/`): Buy & Hold, Random Entry, Simple Momentum, Simple Mean Reversion benchmarks for comparison.

### Alpha Lab API Wiring — Commit `4649980`
- **`POST /api/alpha/research`** (`src/app/api/alpha/research/route.ts`): wires the 12-step AlphaResearchPipeline to the app UI. Session-cookie auth delegated to middleware (no auth logic in handler). Zod validation on symbol/timeframe/candles/config, rate limiting (5 req/min), 120s pipeline timeout. Paper-only: fetches public OHLCV, runs deterministic simulation, returns structured report.
- **Middleware** (`src/middleware.ts`): `/api/alpha` added to `PROTECTED_API_PREFIXES` and `SENSITIVE_GET_PREFIXES`.
- **5 route tests** (`route.test.ts`): success, 400, 429, 422, 500 — all pass.

### Backtest Infrastructure Hardening — Commit `8927373`
- **OHLCV pagination fix** (`data-fetcher.ts`): Binance endTime-only paging fetches up to 1000 candles before endTime, then filters to [startMs, endMs] after the loop. Eliminates duplicate-window overlap from the old startTime+endTime per-page approach.
- **Path traversal guard** (`ohlcv-cache.ts`): `realpathSync` on the resolved cache path rejects any key escaping `CACHE_DIR` before writing. `clearCacheEntry()` added for targeted cache invalidation.
- **BacktestTrade type** (`types.ts`): added optional `exitReason` and `entryRegime` fields for richer trade attribution.

### Real-Data Backtest Scripts — Commit `71cd080`
- Six standalone backtest scripts using live Binance 1h/4h data (cached): `baseline-compare`, `breakout-momentum-test`, `breakout-momentum-4h-test`, `range-mean-reversion-test`, `volatility-strategy-test`, `sol-regime-analysis`. All apply realistic fee/slippage cost models and compute bootstrap p-values.

### Strategy Falsification Research Reports — Commit `011958a`
- Nine markdown reports in `plans/reports/`. **Key finding**: across 844 RSI parameter combinations, 12+ strategy archetypes, and 2 timeframes on BTC/ETH/SOL, no statistically robust edge was found. This is valid falsification — the system correctly refuses to trade live capital on simple TA signals.
