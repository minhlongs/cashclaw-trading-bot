# Direct-D1 Read Store — BotManager Architecture

## Goal

Replace BotManager's in-memory bot registry (`this.bots` Map) with **direct D1 reads everywhere**, so bot state survives Workers cold starts without a separate hydration step. The in-memory cache becomes a short-lived performance optimization, not the source of truth.

## Current architecture (what exists)

- `BotManager.bots` Map = in-memory registry, lost on every cold start
- `BotScheduler.hydrateRunningBots()` = re-hydrates from D1 on each cron tick
- `getOrCreateBot(id)` = lazy single-bot hydration (already D1-backed)
- `BotQueryService` = read-only D1 path (dashboard/list/detail) — **already direct-D1**
- `botDetailHandler` / `botControlHandler` = lazy hydration per request

## Target architecture

- **D1 is the source of truth** for bot config + state (already true — `bots` table)
- `BotManager` methods that read bot state go to D1 first, cache result briefly in memory
- `createBot` / `startBot` / `pauseBot` / etc. write to D1 immediately (already true via `persistNewBot` / `patchBot`)
- In-memory `this.bots` Map becomes an **optional warm cache** with TTL, not a requirement
- `hydrateRunningBots` becomes a no-op (or is removed) — no separate hydration phase needed

## Scope (what changes)

### 1. BotManager core (`src/tree/bot/bot-manager.ts`)
- Add a lightweight in-memory cache with TTL (e.g. 30s) keyed by botId
- `getBot(id)` → check cache, else read D1 via `findBotById`, hydrate if found
- `getAllBots()` → read D1 via `findAllBots` (or cached list)
- `getRunningBots()` → read D1 `WHERE status IN ('paper_test','live_running')`
- `getOrCreateBot(id)` → unchanged (already D1-first)
- `createBot` → keep in-memory add but also persist (already does)
- `startBot` / `pauseBot` / `resumeBot` / `stopBot` → persist to D1 (already do), update cache
- `drainQueues()` → unchanged (operates on `this.queues`, not bots)
- Remove dependency on `hydrateRunningBots` for correctness

### 2. Scheduler (`src/forest/bot/scheduler.ts`)
- `hydrateRunningBots` → no-op or removed (D1 reads replace it)
- `tick()` → call `manager.getRunningBots()` which now reads D1 directly

### 3. Dashboard actions (`src/forest/dashboard/bot-actions.ts`)
- `getBot(id)` now returns from D1-backed cache — no behavior change for callers
- Error message "Bot not found in memory" → "Bot not found" (cosmetic)

### 4. Handlers (`src/forest/api/handlers/bot-control.ts`, `bot-detail.ts`)
- Already use `getOrCreateBot` lazy hydration — no change needed
- `validateStartCredentials` uses `getBot(id)` → now D1-backed, works the same

### 5. Tests
- `bot-manager.test.ts` → update mocks: `findBotById` / `findAllBots` now called by more methods
- `scheduler.test.ts` → `hydrateRunningBots` no longer queries D1 (or is removed)
- `bot-actions.test.ts` → verify D1-mock path
- Add cache-TTL test (getBot twice → second hit uses cache)

## Out of scope

- Durable Objects (user chose direct-D1)
- Changing `BotQueryService` (already direct-D1)
- Changing `drainQueues` / exchange queues
- Live trading (paper-only safety rule)
- Next.js frontend components (they call server actions, which call these)

## Migration / risk

- **Backward compatible**: all callers use `getBotManager()` singleton; the public method signatures don't change
- **Rollback**: revert to previous commit — no schema changes, no migrations
- **Risk**: more D1 reads per request. Mitigated by short-TTL cache (default 30s). Paper-scale bot counts (1–50) make D1 reads cheap.
- **No D1 schema changes** — uses existing `bots` table + `findBotById` / `findAllBots` repos

## Success criteria

1. All existing tests pass (48 bot-manager + scheduler + actions + handlers)
2. `getBot` / `getAllBots` / `getRunningBots` read from D1 when cache misses
3. Cache TTL works: repeated `getBot(id)` within TTL doesn't hit D1 again
4. `hydrateRunningBots` is a no-op or removed
5. Coverage ≥ 90% (current floor)
6. Production deploy green, health check ok
