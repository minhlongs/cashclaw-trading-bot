# Source Tree Inventory

Generated: 2026-08-16

---

## Dependency Map

```
lib  ←── tree  ←── forest  ←── land
 │        │           │
 └── core utilities    │
                       └── API/UI orchestration layer
```

- `lib/` = foundation (no internal deps)
- `tree/` = domain modules (depends on `lib/`)
- `forest/` = orchestration + API layer (depends on `tree/` + `lib/`)
- `land/` = top-level composition (depends on `forest/` + `tree/` + `lib/`)

---

## lib/ — Foundation Layer

### lib/auth/session-utils.ts (117 LOC)
**Exports:**
- `hashPasscode(email, passcode)` — hash user passcode
- `verifyPasscode(email, passcode, storedHash)` — verify passcode
- `generateSessionId()` — generate random session ID
- `parseSessionCookie(req)` — extract session ID from cookie
**Deps:** `lib/db/client`, `lib/crypto`

### lib/canonical-json.ts (52 LOC)
**Exports:**
- `canonicalize(value)` — deterministic JSON serialization
**Deps:** none

### lib/crypto.ts (65 LOC)
**Exports:**
- `encrypt(plaintext)` — AES-256-GCM encrypt
- `decrypt(ciphertext)` — AES-256-GCM decrypt
**Deps:** none (uses Web Crypto API)

### lib/error-codes.ts (42 LOC)
**Exports:**
- `ERROR_CODES` — error code constants
- `ErrorCode` — type
- `brandError(err, code)` — attach error code to Error
- `getErrorCode(err)` — extract error code
**Deps:** none

### lib/logger.ts (62 LOC)
**Exports:**
- `createLogger(module)` — factory returning `{ info, warn, error, debug }`
**Deps:** none

### lib/result.ts (8 LOC)
**Exports:**
- `Result<T>` — discriminated union type
- `ok<T>(data)` — success
- `err(error)` — failure
**Deps:** none

### lib/db/client.ts (28 LOC)
**Exports:**
- `createServerClient()` — create D1Database from env
- `D1Database` — re-export type
**Deps:** `lib/db/types`

### lib/db/types.ts (180 LOC)
**Exports (interfaces):**
- `KVNamespace`, `D1PreparedStatement`, `D1Database`, `Env`
- `User`, `SettingsRow`, `Bot`, `Trade`, `ApiCredential`
- `TradeEvent`, `CapitalSnapshot`, `AuditLog`
- `GridConfig`, `MeanRevConfig`, `StrategyConfig`
- `ParsedGridConfig`, `ParsedMeanRevConfig`, `ParsedStrategyConfig`
- `BacktestResultRow`
**Deps:** none

### lib/db/schema.ts (215 LOC)
**Exports:**
- `SQL` — DDL/DML statements object
- `MIGRATION` — migration SQL string
**Deps:** none

### lib/db/schema-backtest.ts (72 LOC)
**Exports:**
- `SQL_BACKTEST` — backtest DDL statements
- `BACKTEST_MIGRATION` — backtest migration SQL
**Deps:** none

### lib/db/repositories.ts (55 LOC)
**Exports:**
- `findUserById`, `upsertUser`, `insertBot`, `updateBot`, `deleteBot`, `findBotsByUser`, `findBotById`, `findAllBots` — (re-exports from `repo-users-bots`)
- `insertTrade`, `findTradesByBot`, `upsertCredential`, `insertTradeEvent`, `insertCapitalSnapshot`, `insertAudit` — (re-exports from `repo-trades-credentials`)
- `findSettingsByUser(db, userId)` — query settings
- `upsertSettings(db, row)` — upsert settings
- `SettingsRow` — type
**Deps:** `lib/db/repo-users-bots`, `lib/db/repo-trades-credentials`, `lib/db/types`

### lib/db/repo-users-bots.ts (68 LOC)
**Exports:**
- `findUserById`, `upsertUser`, `insertBot`, `updateBot`, `deleteBot`, `findBotsByUser`, `findBotById`, `findAllBots`
**Deps:** `lib/db/types`

### lib/db/repo-trades-credentials.ts (70 LOC)
**Exports:**
- `insertTrade`, `findTradesByBot`, `upsertCredential`, `insertTradeEvent`, `insertCapitalSnapshot`, `insertAudit`
**Deps:** `lib/db/types`

**lib/ total LOC (non-test):** ~1036

---

## tree/ — Domain Layer

### tree/bot/types.ts (184 LOC)
**Exports (types/interfaces):**
- `StrategyContext`, `TradeSignal`, `ChainLeg`, `ChainStrategy`, `ChainNode`, `StrategyChain`
- `PreconditionResult`, `PreconditionFn`
- `BotStatus`, `BotMode`, `StrategyType`, `BotEvent`
- `BaseBotConfig`, `GridBotConfig`, `MeanRevBotConfig`, `BotConfig`
- `BotState`, `BotTrade`, `GridLevelStatus`, `GridLevel`, `BotAuditLog`
- `BotCallbacks`, `BotDependencies`
**Exports (functions):**
- `hasStrategyChain(config)`, `isGridConfig(config)`, `isMeanRevConfig(config)`
**Deps:** none (standalone types)

### tree/bot/killswitch.ts (164 LOC)
**Exports:**
- `Killswitch` class — global emergency halt
- `KillswitchCallbacks`, `KillswitchConfig`, `KillswitchState` (types)
**Deps:** `lib/logger`

### tree/bot/bot-instance.ts (267 LOC)
**Exports:**
- `BotInstance` class — single bot lifecycle
- `BotCallbacks`, `BotDependencies` (types)
**Deps:** `tree/bot/types`, `tree/bot/killswitch`, `tree/exchange/live`, `tree/exchange/paper`

### tree/bot/bot-manager.ts (273 LOC)
**Exports:**
- `BotManager` class — bot fleet manager
- `getBotManager(deps?)` — singleton accessor
- `resetBotManager()` — reset singleton
- `BotManagerDependencies`, `CreateBotRequest`, `ExchangeOrchestrator` (types)
**Deps:** `tree/bot/bot-instance`, `tree/bot/types`, `forest/flight-recorder`

### tree/bot/bot-order-executor.ts (140 LOC)
**Exports:** (barrel in index.ts)
- `BotOrderExecutor` class — order placement helper
**Deps:** `tree/exchange/types`, `lib/result`

### tree/bot/bot-manager-helpers.ts (80 LOC)
**Exports:**
- Helper functions for BotManager (bot hydration, status sync)
**Deps:** `forest/bot/d1-adapter`

### tree/bot/strategies/grid.ts (170 LOC)
**Exports:**
- `GridStrategy` class — grid trading strategy
- `GridStrategyCallbacks` (type)
**Deps:** `tree/bot/types`

### tree/bot/strategies/mean-reversion.ts (120 LOC)
**Exports:**
- `MeanRevStrategy` class — mean reversion strategy
- `MeanRevStrategyCallbacks` (type)
**Deps:** `tree/bot/types`

### tree/bot/strategy-chain/index.ts (30 LOC)
**Exports:**
- `buildDefaultChain(config)` — build default strategy chain from config
- `ChainStrategy`, `StrategyChain`, `StrategyContext`, `TradeSignal`, `ChainLeg` (types)
**Deps:** `tree/bot/types`

### tree/bot/index.ts (38 LOC)
**Re-exports from:**
- `killswitch` — `Killswitch`, `KillswitchCallbacks`, `KillswitchConfig`, `KillswitchState`
- `bot-instance` — `BotInstance`, `BotCallbacks`, `BotDependencies`
- `bot-manager` — `BotManager`, `getBotManager`, `resetBotManager`, `CreateBotRequest`, `BotManagerDependencies`
- `types` — all config/state/event types + `isGridConfig`, `isMeanRevConfig`, `hasStrategyChain`
- `strategies/grid` — `GridStrategy`, `GridStrategyCallbacks`
- `strategies/mean-reversion` — `MeanRevStrategy`, `MeanRevStrategyCallbacks`
- `strategy-chain` — `buildDefaultChain`, `ChainStrategy`

### tree/exchange/types.ts (130 LOC)
**Exports (types):**
- `ExchangeId`, `Side`, `OrderType`, `OrderStatus`, `TimeInForce`
- `Ticker`, `OrderBookLevel`, `OrderBook`, `Balance`
- `OrderRequest`, `OrderResult`, `Position`
- `ExchangeAdapter` (interface), `ExchangeConfig` (interface)
**Exports (constants):**
- `EXCHANGE_BASE_URLS`
**Deps:** none (standalone types)

### tree/exchange/error-normalizer.ts (71 LOC)
**Exports:**
- `normalizeError(raw)` — normalize exchange errors to `{ code, message, retryable, rateLimit }`
**Deps:** none

### tree/exchange/ccxt/client.ts (68 LOC)
**Exports:**
- `createCCXTClient(exchangeId, apiKey, secret, testnet?)` — create CCXT adapter
**Deps:** `tree/exchange/types`

### tree/exchange/rate-limiter/index.ts (235 LOC)
**Exports:**
- `rateLimiter` — singleton `RateLimiter` instance
- `RateLimiter` class — token-bucket rate limiter with backoff
- `EndpointCategory` type
- `TokenBucket` interface
**Deps:** `tree/exchange/rate-limiter/headers`, `tree/exchange/rate-limiter/wedge-watchdog`, `tree/exchange/rate-limiter/errors`

### tree/exchange/rate-limiter/headers.ts (38 LOC)
**Exports:**
- `parseRateLimitHeaders(headers)` — parse exchange rate-limit response headers
**Deps:** none

### tree/exchange/rate-limiter/errors.ts (43 LOC)
**Exports:**
- `RateLimitExecutionTimeout` — custom error class
**Deps:** none

### tree/exchange/rate-limiter/wedge-watchdog.ts (80 LOC)
**Exports:**
- `WedgeWatchdog` — detects stuck/wedged rate limiter buckets
**Deps:** `tree/exchange/rate-limiter/errors`

### tree/exchange/provider/circuit-breaker.ts (140 LOC)
**Exports:**
- `CircuitBreaker` class — circuit breaker state machine
- `CircuitOpenError` — custom error
**Deps:** `tree/exchange/provider/circuit-breaker-kinds`

### tree/exchange/provider/circuit-breaker-kinds.ts (60 LOC)
**Exports:**
- `classifyFailure(error)` — classify failure kind
- `FAILURE_KIND_THRESHOLDS` — threshold config
- `FailureKind` type
**Deps:** none

### tree/exchange/provider/circuit-persistence.ts (50 LOC)
**Exports:**
- `saveState(breaker)` — persist circuit state
- `loadState(exchange)` — load persisted state
- `LoadedCircuitState` type
**Deps:** none (uses KV namespace)

### tree/exchange/provider/paper-provider.ts (120 LOC)
**Exports:**
- `PaperExchangeProvider` class — simulated exchange
**Deps:** `tree/exchange/types`, `tree/exchange/queue`

### tree/exchange/provider/provider.ts (135 LOC)
**Exports:**
- `ProviderChain` class — chain of exchange providers with health checks
- `Provider`, `TickerProvider`, `OrderProvider`, `ProviderResult` (types)
**Deps:** `tree/exchange/provider/types`, `tree/exchange/provider/circuit-breaker`, `lib/logger`

### tree/exchange/provider/types.ts (50 LOC)
**Exports:**
- `ProviderState`, `ProviderHealth`, `ProviderBudget`, `ProviderConfig`, `PaperProviderConfig`, `ExchangeProvider` (types)
**Deps:** `tree/exchange/types`

### tree/exchange/provider/index.ts (35 LOC)
**Re-exports from:**
- `types` — `ProviderState`, `ProviderHealth`, `ProviderBudget`, `ProviderConfig`, `PaperProviderConfig`, `ExchangeProvider`
- `paper-provider` — `PaperExchangeProvider`
- `circuit-breaker` — `CircuitBreaker`, `CircuitOpenError`
- `provider` — `ProviderChain`, `ProviderResult`, `Provider`, `TickerProvider`, `OrderProvider`
- `circuit-breaker-kinds` — `FailureKind`, `FAILURE_KIND_THRESHOLDS`, `classifyFailure`
- `circuit-persistence` — `LoadedCircuitState`, `saveState`, `loadState`
- `../queue` — `RequestQueue`, `CostTracker`, `QueuedExchangeAdapter`, `RequestPriority`, `PRIORITY_LABELS`, `DEFAULT_QUEUE_CONFIG`, `QueueItem`, `QueueConfig`, `DrainResult`, `QueuedAdapterDeps`

### tree/exchange/queue/request-queue.ts (120 LOC)
**Exports:**
- `RequestQueue` class — cost-aware priority queue
**Deps:** `tree/exchange/queue/types`

### tree/exchange/queue/cost-tracker.ts (80 LOC)
**Exports:**
- `CostTracker` class — track API call costs
**Deps:** none

### tree/exchange/queue/queued-adapter.ts (110 LOC)
**Exports:**
- `QueuedExchangeAdapter` class — wraps ExchangeAdapter with queue
- `QueuedAdapterDeps` type
**Deps:** `tree/exchange/queue/request-queue`, `tree/exchange/queue/cost-tracker`, `tree/exchange/types`

### tree/exchange/queue/types.ts (45 LOC)
**Exports:**
- `RequestPriority`, `PRIORITY_LABELS`, `DEFAULT_QUEUE_CONFIG`
- `QueueItem`, `QueueConfig`, `DrainResult` (types)
**Deps:** none

### tree/exchange/queue/index.ts (22 LOC)
**Re-exports from:** `request-queue`, `cost-tracker`, `queued-adapter`, `types`

### tree/exchange/live/index.ts (170 LOC)
**Exports:**
- `LiveExchangeAdapter` class — real trading via CCXT with killswitch + rate limit
**Deps:** `tree/exchange/ccxt/client`, `tree/exchange/rate-limiter`, `tree/exchange/types`, `tree/bot/killswitch`, `lib/logger`

### tree/exchange/paper/index.ts (185 LOC)
**Exports:**
- `PaperExchangeAdapter` class — simulated trading
**Deps:** `tree/exchange/types`, `tree/exchange/rate-limiter`, `lib/logger`

### tree/exchange/ws/ws-connection.ts (90 LOC)
**Exports:**
- `WsConnection` class — base WebSocket connection
**Deps:** `tree/exchange/ws/ws-types`

### tree/exchange/ws/binance-ws-connection.ts (115 LOC)
**Exports:**
- `BinanceWsConnection` class — Binance-specific WS
**Deps:** `tree/exchange/ws/ws-connection`

### tree/exchange/ws/ws-manager.ts (110 LOC)
**Exports:**
- `WsManager` class — manage WS connections per exchange
- `wsManager` — singleton instance
**Deps:** `tree/exchange/ws/ws-connection`, `tree/exchange/ws/binance-ws-connection`

### tree/exchange/ws/ws-types.ts (40 LOC)
**Exports:**
- `WsEventType`, `WsCallback`, `WsSubscription` (types)
**Deps:** none

### tree/exchange/ws/index.ts (18 LOC)
**Re-exports from:** `ws-connection`, `binance-ws-connection`, `ws-manager`, `ws-types`

### tree/quantlib/index.ts (40 LOC)
**Exports:**
- `QuantLibContext`, `QuantResult`, `QuantFn` (types/interfaces)
- `quantFunctions` — registry of quant functions (`noop`, `grid`, `mean_reversion`)
**Deps:** none

### tree/quantlib/functions.ts (65 LOC)
**Exports:**
- `gridLevels(config, currentPrice)` — compute grid levels
- `meanReversionSignal(data, windowSize)` — compute mean reversion signal
**Deps:** none

### tree/telemetry/types.ts (55 LOC)
**Exports:**
- `TradeEvent`, `TradeEventType`, `CapitalSnapshot`, `DailyMetrics`, `GoLiveReadiness` (types)
**Deps:** none

### tree/telemetry/writer.ts (140 LOC)
**Exports:**
- `TelemetryWriter` class — write telemetry to D1
**Deps:** `tree/telemetry/types`, `lib/db/client`, `lib/logger`

### tree/telemetry/index.ts (15 LOC)
**Re-exports from:** `writer` — `TelemetryWriter`; `types` — `TradeEvent`, `TradeEventType`, `CapitalSnapshot`, `DailyMetrics`, `GoLiveReadiness`

**tree/ total LOC (non-test):** ~4746

---

## forest/ — Orchestration Layer

### forest/api/auth-guard.ts (65 LOC)
**Exports:**
- `requireAuth(request)` — extract userId from session cookie; throw if not authenticated
**Deps:** `lib/auth/session-utils`, `lib/db/repositories`

### forest/api/rate-limiter.ts (48 LOC)
**Exports:**
- `rateLimitMiddleware(request, config?)` — simple in-memory rate limit guard
**Deps:** none

### forest/api/routes.ts (45 LOC)
**Exports:**
- `handleApiRoute(method, pathname, request)` — route API requests to handlers
**Deps:** `forest/api/handlers/*`

### forest/api/handlers/bot-control.ts (108 LOC)
**Exports:**
- `handleBotControl(botId, action, body?)` — handle start/stop/pause/resume actions
**Deps:** `tree/bot/bot-manager`, `forest/bot/d1-adapter`, `forest/monitoring/alerts`, `forest/flight-recorder`

### forest/api/handlers/bot-create.ts (130 LOC)
**Exports:**
- `handleBotCreate(body)` — create new bot with validation
**Deps:** `tree/bot/bot-manager`, `forest/api/auth-guard`, `forest/bot/d1-adapter`, `lib/db/repositories`

### forest/api/handlers/bot-detail.ts (65 LOC)
**Exports:**
- `handleBotDetail(botId)` — get bot details with trades
**Deps:** `tree/bot/bot-manager`, `forest/dashboard/bot-detail`

### forest/api/handlers/bot-list.ts (60 LOC)
**Exports:**
- `handleBotList(userId?)` — list all bots (admin or user-scoped)
**Deps:** `tree/bot/bot-manager`, `forest/api/auth-guard`

### forest/api/handlers/bot-metrics.ts (55 LOC)
**Exports:**
- `handleBotMetrics()` — aggregated bot metrics
**Deps:** `forest/dashboard/bot-kpis`

### forest/api/handlers/bot-settings.ts (85 LOC)
**Exports:**
- `handleBotSettings(userId)` — get/update settings
**Deps:** `forest/settings/actions`

### forest/api/handlers/killswitch.ts (70 LOC)
**Exports:**
- `handleKillswitchStatus()` — get killswitch state
- `handleKillswitchHalt(reason)` — halt all bots
- `handleKillswitchResume()` — resume operations
**Deps:** `tree/bot/killswitch`, `forest/monitoring/alerts`

### forest/api/handlers/version.ts (35 LOC)
**Exports:**
- `handleVersion()` — return app version
**Deps:** none

### forest/bot/d1-adapter.ts (55 LOC)
**Exports:**
- `hydrateFromD1(userId, onError?)` — load bots from D1 into memory
- `loadAllBotsFromD1(onError?)` — load all bots
- `ErrorHandler` type
- `persistBot`, `patchBot`, `deleteBotRecord`, `persistTrade`, `persistCredential`, `persistEvent`, `persistSnapshot`, `persistAudit` (re-exports from d1-persistence)
**Deps:** `forest/bot/d1-hydration`, `forest/bot/d1-persistence`

### forest/bot/d1-hydration.ts (105 LOC)
**Exports:**
- `hydrateFromD1(userId, onError?)` — hydrate bots from D1
- `loadAllBotsFromD1(onError?)` — hydrate all bots
- `ErrorHandler` type
**Deps:** `tree/bot/bot-manager`, `lib/db/repositories`, `lib/logger`

### forest/bot/d1-persistence.ts (200 LOC)
**Exports:**
- `persistBot`, `patchBot`, `deleteBotRecord`
- `persistTrade`, `persistCredential`, `persistEvent`, `persistSnapshot`, `persistAudit`
**Deps:** `lib/db/client`, `lib/db/repositories`, `tree/bot/types`, `lib/logger`

### forest/bot/scheduler.ts (168 LOC)
**Exports:**
- `BotScheduler` class — cron-driven bot tick scheduler
- `SchedulerDeps`, `SchedulerTickReport`, `SchedulerError` (interfaces)
**Deps:** `tree/bot/bot-manager`, `lib/logger`

### forest/dashboard/bot-actions.ts (80 LOC)
**Exports:**
- `botActionStart`, `botActionStop`, `botActionPause`, `botActionResume`
- `killswitchActionHalt`, `killswitchActionResume`
**Deps:** `tree/bot/bot-manager`, `tree/bot/killswitch`, `forest/bot/d1-adapter`

### forest/dashboard/bot-detail.ts (145 LOC)
**Exports:**
- `BotDetailData`, `TradeRow` (interfaces)
- `getBotDetail(id)`, `getTradeHistory(botId, limit)`, `getAllBots()`
**Deps:** `tree/bot/bot-manager`, `forest/bot/d1-adapter`, `lib/db/repositories`

### forest/dashboard/bot-kpis.ts (130 LOC)
**Exports:**
- `BotCardData`, `DashboardKpis`, `DashboardData` (interfaces)
- `getDashboardData()`, `getKpis()`, `getBotCards()`
**Deps:** `tree/bot/bot-manager`, `forest/bot/d1-adapter`, `lib/logger`

### forest/dashboard/capital-snapshots.ts (40 LOC)
**Exports:**
- `getCapitalSnapshots(botId, limit)`
**Deps:** `lib/db/repositories`

### forest/dashboard/exchange-health.ts (55 LOC)
**Exports:**
- `ExchangeHealthCard` interface
- `getExchangeHealth()`
**Deps:** `land/exchange-orchestration`

### forest/dashboard/trade-events.ts (45 LOC)
**Exports:**
- `getRecentEvents(botIds?)`
**Deps:** `lib/db/repositories`

### forest/dashboard/actions.ts (22 LOC)
**Re-exports from:** `bot-kpis`, `trade-events`, `capital-snapshots`, `audit-ledger`, `exchange-health`

### forest/flight-recorder/index.ts (165 LOC)
**Exports:**
- `FlightRecorder` class — D1-backed bot lifecycle event persistence
- `getFlightRecorder()`, `resetFlightRecorder()` — singleton access
- `appendAudit`, `ensureAuditLedgerSchema` (from audit-ledger)
- `AuditEntry`, `LedgerTail` (types)
**Deps:** `lib/db/client`, `lib/db/types`, `forest/flight-recorder/flight-recorder-helpers`

### forest/flight-recorder/audit-ledger.ts (105 LOC)
**Exports:**
- `appendAudit(entry)` — append audit entry to D1
- `ensureAuditLedgerSchema(db)` — ensure audit_ledger table exists
- `AuditEntry`, `LedgerTail` (types)
**Deps:** `lib/db/client`, `lib/canonical-json`, `lib/logger`

### forest/flight-recorder/flight-recorder-types.ts (40 LOC)
**Exports:**
- `BotRecord`, `NewBotInput`, `NewTickInput`, `NewFillInput` (types)
**Deps:** none

### forest/flight-recorder/flight-recorder-helpers.ts (50 LOC)
**Exports:**
- `formatBotRow(row)` — transform D1 row to BotRecord
**Deps:** `forest/flight-recorder/flight-recorder-types`

### forest/monitoring/alerts.ts (85 LOC)
**Exports:**
- `Alert`, `AlertHandler` (interfaces)
- `onAlert(handler)` — register alert handler, returns unsubscribe
- `emitAlert(level, message, context?)` — emit alert
- `getAlerts(limit)`, `getAlertsByLevel(level)`, `clearAlerts()`
**Deps:** none (in-memory)

### forest/settings/actions.ts (330 LOC)
**Exports:**
- `SettingsData` interface
- `getSettings()`, `updateExchangeCredentials(...)`, `updateRiskLimits(...)`, `updateNotificationSettings(...)`
- `emergencyHalt(reason)`, `resumeFromHalt()`
- `saveKillswitchDailyState(daily)`
**Deps:** `lib/db/client`, `lib/db/repositories`, `lib/db/types`, `tree/bot/killswitch`, `tree/bot/bot-manager`, `forest/monitoring/alerts`, `lib/result`

**forest/ total LOC (non-test):** ~2481

---

## land/ — Composition Layer

### land/exchange-orchestration/index.ts (260 LOC)
**Exports:**
- `ExchangeOrchestrator` class — top-level exchange composition: killswitch + provider chain + circuit breaker + rate limiter
- `ExchangeOrchestratorDeps` interface
- `getExchangeOrchestrator(deps?)`, `resetExchangeOrchestrator()` — singleton access
**Deps:** `tree/exchange/types`, `tree/exchange/provider`, `tree/bot/killswitch`, `lib/result`, `lib/logger`

**land/ total LOC (non-test):** ~260

---

## app/ — API Routes (Next.js)

### app/api/auth/login/route.ts (65 LOC)
### app/api/auth/logout/route.ts (26 LOC)
### app/api/auth/me/route.ts (53 LOC)
### app/api/bots/[id]/route.ts (25 LOC)
### app/api/bots/route.ts (65 LOC)
### app/api/health/route.ts (38 LOC)
### app/api/killswitch-status/route.ts (75 LOC)
### app/api/metrics/route.ts (48 LOC)
### app/api/settings/route.ts (52 LOC)
### app/api/version/route.ts (35 LOC)

**app/ total LOC (non-test):** ~482

---

## components/ (types only)

### components/bots/wizard-types.ts (55 LOC)
**Exports:** Wizard step types for bot creation UI

### components/monitoring/monitoring-types.ts (45 LOC)
**Exports:** Monitoring panel types

---

## Root

### worker.ts (60 LOC)
**Exports:**
- Cloudflare Worker entry point
**Deps:** `forest/api/routes`

---

## Summary by Layer

| Layer | Non-test LOC | Module Count |
|-------|-------------|--------------|
| lib/ | ~1036 | 14 files |
| tree/ | ~4746 | 32 files |
| forest/ | ~2481 | 21 files |
| land/ | ~260 | 1 file |
| app/ | ~482 | 10 files |
| components/ | ~100 | 2 files |
| worker.ts | ~60 | 1 file |
| **Total** | **~9165** | **81 files** |

## Key External Dependencies

- **CCXT** — exchange client wrapper (tree/exchange/ccxt/client.ts)
- **Cloudflare D1** — SQLite database (via lib/db/)
- **Cloudflare KV** — circuit breaker state persistence
- **Web Crypto API** — AES-256-GCM encryption (lib/crypto.ts)
