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
| **P0.8 — Quality gate restoration** | 48 archived files moved to tracked `archive/falsification/` (knip project glob excludes it); 5 stale `ignoreFiles` entries removed; dead `evaluator/data-fetcher.ts` stub deleted; `quality:gate` exits 0 | commit `f0b0ce7` |
| **P0.9 — Real-data backtest script** | `scripts/alpha-real-data-backtest.ts` — live Binance OHLCV + all four derivative sources through the full pipeline; verified end-to-end, graceful degradation on 403 | commit `ac4b5ff` |
| **P0.10 — Archive/tsc alignment** | `archive/` added to `tsconfig.json` exclude so archived files don't block type-check; real-data backtest script aligned with current `RegimeConfig`/`WindowConfig`/`Logger` signatures | commit `ec53022` |
| **Cross-exchange routing (paper-only)** | Runtime selection across binance/bybit/okx: `RoutingConfig` + Zod schema (`routing-types.ts`), pure `ExchangeRouter` (pinned / round-robin / best-health policies, deterministic), `RoutingChain` ordered multi-provider fallback preserving `ProviderResult` provenance; wired into `ExchangeOrchestrator` via `RoutedExecution` (`configureRouting`, `routedFetchTicker`, `routedPlaceOrder`, `routedCancelOrder`, `routedFetchOrder`) with orderId→exchange affinity so cancel/fetch return to the placing exchange. Killswitch guard preserved on the routed order path. Paper-only invariant: type-level `@ts-expect-error` guards prove `LiveExchange` cannot enter routing slots; source-level test forbids live/ccxt imports in routing files. 6 guard tests + 14 router tests + 9 chain tests + 14 routed-execution tests | commits `92db712`, `c473423`, `d93a2f1`, `21d32c6` |
| **Alpha Research OS Phase 2** (2026-08-23) | Research queue with 7-state lifecycle (`PROPOSED→VALIDATING→RUNNING→EVALUATED→SURVIVED/FALSIFIED→ARCHIVED`, duplicate prevention via configHash, fail-closed `validateJobSpec`) in `src/tree/alpha/queue/`; multiple-testing defense (bootstrap CI, permutation/random-entry baseline, counters, PBO proxy, parameter sensitivity, walk-forward + cross-asset consistency, `evaluateSurvival` ANY-fail→falsified) in `src/forest/alpha/multiple-testing/`; append-only D1 store `migrations/0010_research_queue.sql` + `queue-d1-store.ts`. 184 new tests (2307 total), coverage 86.98% | branch `feat/alpha-research-os-phase2` |
| **Alpha Research OS Phase 3** (2026-08-24) | Microstructure data infrastructure: fail-closed REST polling ingestion (Binance `depth?limit=20` + `aggTrades`) in `src/forest/alpha/microstructure/`; parse/quality/feature-computer domain in `src/tree/alpha/microstructure/` (9 causal feature contracts with publication-lag `asOf` gate); append-only D1 store `migrations/0011_microstructure_data.sql` (4 tables) + `micro-d1-store.ts`; worker cron wiring gated on `MICRO_INGEST_ENABLED` (default OFF). 93 new tests (2412 total), coverage thresholds held 82/85/85/82 | migrations/0011, 2412/2412 tests |
| **Alpha Research OS Phase 4** (2026-08-24) | Cross-sectional engine: causal portfolio simulator `runCrossSectionalSim` in `src/tree/alpha/cross-sectional/` (weights decided at snapshot t earn return t→t+1; one-sided turnover ½·Σ\|Δw\|; fees+slippage via costBps/stressMode; fail-closed, never forward-fill); beta-aware sizing (`estimateRollingBetas` strictly-before-window OLS, `scaleWeightsToTargetBeta` — targetBeta=0 via neutralization not ÷βp, fail-closed fallback; `inverseBetaTilt` in `beta-tilt.ts`); evaluation suite in `src/forest/alpha/cross-sectional-eval/` (Sharpe/Sortino annualized on portfolio return series, max drawdown on equity curve, long/short + cost attribution, gross/net exposure series, regime breakdown via injected labels only); wire-in seam `evaluateCrossSectional`. 90 new tests (2502 total), coverage 87.44% ≥ thresholds 82/85/85/82. Walk-forward composition deferred to Phase 6 | branch `feat/alpha-research-os-phase4`, 2502/2502 tests |
| **Alpha Research OS Phase 5** (2026-08-25) | Relative-value research: causal pair-spread engine `runPairSpreadSim` in `src/tree/alpha/relative-value/` (hedge ratio β(t) from data strictly < t via `estimateRollingHedgeRatio`; fail-closed tradability gate `validatePairTradable` — cointegration + finite half-life + correlation floor; 3-state entry-exit machine; one-sided turnover + cost stress modes); tree-local `src/tree/alpha/cost-stress.ts` layering fix (tree never imports forest); evaluation suite in `src/forest/alpha/relative-value-eval/` (Sharpe/Sortino, drawdown, cost attribution, realized-beta diagnostic, parallel `RelativeValueReport`); wire-in seam `evaluateRelativeValue`. 117 new tests (2619 total), coverage 88.03% ≥ thresholds 82/85/85/82. Multi-pair scan + walk-forward deferred to Phase 6 | branch `feat/alpha-research-os-phase5`, 2619/2619 tests |
| **Alpha Research OS Phase 6** (2026-08-25) | Alpha composition + portfolio engine + EXTREME cost model: standardized `ComposedAlpha` object with deterministic config-driven net-edge scoring (`scoreAlpha`/`scoreComposedAlphas` in `src/tree/alpha/composition/`, fail-closed rejection reasons, weights declared never learned); portfolio engine `buildPortfolio` in `src/tree/alpha/portfolio/engine.ts` — nine sequential risk overlays applied AFTER alpha scoring (vol targeting, position/gross/net caps, correlated bucket, beta exposure, turnover, drawdown de-risk), null-beta fail-closed flagging; EXTREME stress mode (100 bps) byte-identical across tree/forest cost modules with pin tests; composition evaluation seam `evaluateComposition` in `src/forest/alpha/composition-eval/` with leakage-isolation suite (mutate-future byte-identical, shift-boundary, all-rejected flat path). 52 new tests (2671 total), coverage 88.22% ≥ thresholds. Multi-pair scan + walk-forward remain deferred | PR #6, commit `985c9f1`, 2671/2671 tests |

## Go-Live — Production Deploy (2026-08-19)

CashClaw paper-trading platform deployed to Cloudflare Workers production at
`https://cashclaw-trading-bot.agencyos-openclaw.workers.dev`. Paper-only — no
real orders, no live capital. Deploy preceded by the falsification campaign
NO-GO (all 24 hypothesis classes falsified, zero persistent OOS positive
expectancy), so the system ships as a research/paper platform, not a live
trader.

**Deploy blockers fixed first:**
- `docs/deploy-runbook.md` referenced nonexistent `npm run deploy:worker` —
  corrected to `npm run deploy` (the real script that injects `GIT_COMMIT_SHA`
  + `BUILD_TIMESTAMP` and runs OpenNext build + deploy).
- Runbook listed a KV binding that no longer exists in `wrangler.jsonc` —
  `CACHE` is declared optional in `src/lib/db/types.ts` but never read at
  runtime. Checklist now documents the actual required secrets/vars.
- Added `.env.example` (was missing entirely — developers had to read source to
  learn required secrets). Un-ignored in `.gitignore` (the `.env.*` glob was
  catching it).

**Pre-deploy gates:** type-check clean, lint 0 warnings, build clean, 1880/1880
tests pass.

**Post-deploy smoke:** `/api/health` returns `status: "ok"` with
`db`/`circuitBreaker`/`rateLimiter` all `"ok"`; `/api/version` reports
`shortSha: 00c81b3f`; `/api/killswitch-status` and `/api/metrics` return 200.

## Current State

- **Tests:** 1880 across 130 files, full suite green
- **Coverage:** statements 82.47%, branches 86.37%, functions 90.75%, lines 82.47% (thresholds 82/85/85/82)
- **Lint:** 0 ESLint warnings (enforced via `--max-warnings 0` + `reportUnusedDisableDirectives: error`)
- **TypeScript:** 0 errors on `tsc --noEmit`
- **Build:** clean
- **Quality gate:** `npm run quality:gate` exits 0 (type-check + lint + coverage + knip)

## Alpha Discovery Engine (Phases 1–10)

All 14 phases of the autonomous alpha discovery + regime-aware research engine are complete.

| Phase | What shipped | Evidence |
|---|---|---|
| 1. Reconnaissance | Full architecture audit, reuse map, risk map, data flow diagram, `docs/alpha-discovery-architecture.md` | architecture doc |
| 2. Alpha Lab | Modular research layer: `tree/alpha/` (indicators, labeling, correlation, factors, hypothesis, portfolio, signals) + `forest/alpha/` (pipeline, baselines, evaluation, attribution, experiments) | modules + 244 tests |
| 3. Regime Engine | Deterministic `RuleBasedRegimeClassifier` with 7 regimes, `extractRegimeFeatures` (6 features), causal regression tests (`leakage.test.ts`, 6 tests), hysteresis, alpha routing | `src/tree/regime/` |
| 4. Feature Pipeline | `declareFeature()` gate requiring name/timeframe/source/lookback/availability/causal; rejects non-causal features; `FeatureSource` / `FeatureAvailability` types | `indicator-types.ts` |
| 5. Triple-Barrier Labeling | `labelEvent()` with configurable TP/SL/timeout, 17 tests covering TP-first, SL-first, simultaneous, timeout, edge cases | `labeling.ts` |
| 6. Experiment Engine | `ExperimentConfig` with hypothesis/dataset/feature set/regime filter/entry+exit rules/cost+slippage model/train+val+test periods/seed/git-commit; deterministic `runExperiment` with DI | `experiments/` |
| 7. Walk-Forward Validation | Rolling/expanding windows: train → validate → test; in-sample, validation, out-of-sample metrics | `walkforward.ts` |
| 8. Cost Model | `applyCosts()` with NORMAL/CONSERVATIVE/ADVERSE stress modes (5/10/20+ bps); gross → net PnL | `cost-model.ts` |
| 9. Strategy Evaluation | Full evaluation report: Sharpe, Sortino, profit factor, expectancy, max drawdown, fees, exposure, regime breakdown, monthly breakdown | `evaluation/report.ts` |
| 10. Baselines | Buy & Hold, Random Entry, Simple Momentum, Simple Mean Reversion benchmarks | `baselines/` |
| 11. Ablation testing | `runAblation()` — full model vs. one-indicator-removed per feature; reports deltaWinRate/deltaPassRate/materialImpact and flags unnecessary features. Pure function, 100% covered, 9 tests | `ablation.ts` |
| 12. Alpha routing | `routeAlphas()` — regime-conditioned alpha filter/ranker (SHOCK blocks, UNKNOWN pass-through, per-regime direction + confidence thresholds, topN cap, overrides). Pure function, 96% covered, 18 tests | `alpha-router.ts` |
| 15. Survival gate | `runSurvivalGate()` — 8 configurable research checks (trades, expectancy, profit factor, drawdown, Sharpe, regime coverage, fee stress, slippage stress). Returns PAPER_CANDIDATE or KILLED, never LIVE. Pure function, 15 tests | `survival-gate.ts` |
| 17. Promotion state machine | `transitionStrategy()` — 9-state lifecycle (RESEARCH→BACKTEST→OOS_PASS→ROBUSTNESS_PASS→PAPER→SHADOW→MANUAL_APPROVAL→LIVE, with KILLED terminal). `gate_passed` is capped at SHADOW; MANUAL_APPROVAL and LIVE are reachable only via explicit human triggers. `gateResultToTrigger()` wires the survival gate output in with zero adapter code. Pure function, 23 tests | `promotion-states.ts` |

**Non-TA market-structure layer (commits `52d9ef9`, `7a1c8c2`, `57db6ae`):**
Four Binance signal sources (funding rate, OI, liquidation, premium index) with causal feature computation, 1.5x vote-margin aggregation, per-source failure logging, cache safety, and deterministic offline injection.

**Falsification result:** Zero strategies with positive out-of-sample expectancy on 2026 data (see `plans/reports/technical-strategy-falsification-2026-08-17.md`). This is the honest answer — nothing works yet.

**Campaign complete (2026-08-18):** All 24 hypothesis classes now falsified. The last candidate (funding × price extreme interaction) failed 6-window walk-forward: 10/162 OOS passes (6%), aggregate PnL -$455,090, no config passing in more than 1/6 windows. Signal was regime-locked to mid-2022 bear market — pure overfitting. Definitive report: `docs/falsification-report.md`. **Do not re-test dead hypotheses on OHLCV/funding/OI data — the signal space is exhausted.**

## Alpha Lab — API Wiring + Real-Data Backtests

**API endpoint** (`POST /api/alpha/research`): wires the 12-step AlphaResearchPipeline to the app UI. Session-cookie auth via middleware. Zod validation, rate limiting (5 req/min), 120s timeout. Paper-only.

**Real-data backtest scripts:** six standalone scripts using live Binance 1h/4h data (cached) — baseline comparison, breakout momentum (1h/4h), range mean-reversion, volatility strategy, regime analysis. All apply realistic fee/slippage cost models and compute bootstrap p-values.

**Infrastructure hardening:** Binance endTime-only pagination (no duplicate-window overlap), path-traversal guard in OHLCV cache, `exitReason`/`entryRegime` on `BacktestTrade`.

## Known Backlog (v2 and beyond)

- **BotManager hydration architecture** — replace in-memory registry + per-request hydration with a cold-start-resilient store (Durable Objects or direct-D1 reads everywhere).
- **Live exchange** — CCXT on Workers feasibility is unresolved; requires D1 provisioning, live engine wiring, and explicit customer opt-in.
- **Coverage tail** — 87.5%→90% possible (page-client, LandingClient, CtaClient) but low signal for v1; revisit after more business-logic tests.
- **Live derivative data** — all four `/fapi/v1/*` endpoints return HTTP 403 from this environment; derivative fetchers are exercised only via offline injection.

## Conventions

- Every task runs through the orchestration pipeline (plan → gate → execute → verify → SHIP) before committing.
- Conventional commit messages, no AI references or phase labels in messages.| BotManager cold-start hydration | Scheduler + cron + health rehydrate running bots from D1 on every Workers cold start; auto-restart bots without a strategy instance | commit `3e9a814` |
