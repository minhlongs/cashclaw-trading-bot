# Plan: Issue #51 — Multi-Tenant Scoping for Events, Daily Stats, Hono Worker Routes & D1 Bot Writes

- **Issue:** #51
- **Branch:** `feat/issue-51-events-dailystats-worker-d1-scoping`
- **Status:** completed
- **Date:** 2026-11-09

## 1. Objective
Close the remaining multi-tenant (`userId`) isolation and D1 SQL defense-in-depth seams across `eventsHandler`, `dailyStatsHandler`, Hono Worker protected routes (`src/worker-api-routes.ts`), and D1 bot write helpers (`updateBot`/`patchBot`, `deleteBot`/`deleteBotRecord`).

## 2. Phases & File Ownership

### Phase 1: `eventsHandler` & `dailyStatsHandler` Multi-Tenant `userId` Scoping
- **Files:**
  - `src/forest/api/handlers/events.ts`
  - `src/forest/api/handlers/events.test.ts`
  - `src/forest/api/handlers/daily-stats.ts`
  - `src/forest/api/handlers/daily-stats-query.ts`
  - `src/forest/api/handlers/__tests__/daily-stats-db-empty.test.ts`
- **Changes:**
  - Update `eventsHandler(botId?: string, limit = 50, userId?: string)` to join `bots b ON trade_events.bot_id = b.id` and filter `b.user_id = ?` when `userId` is provided (both with and without `botId`).
  - Update `dailyStatsHandler(userId?: string)` and `fetchDailyStatsRaw(db, startTimestamp, userId?: string)` to join `bots b ON ...bot_id = b.id` and filter `b.user_id = ?` on `capital_snapshots` and `trade_events` when `userId` is provided.

### Phase 2: Hono Worker Route `userId` Forwarding
- **Files:**
  - `src/worker-api-routes.ts`
  - `src/worker-api-routes.test.ts`
  - `src/worker.test.ts`
- **Changes:**
  - Add `resolveWorkerUserId(c)` in `src/worker-api-routes.ts` reading `c.req.header('x-user-id')?.trim() || c.req.query('userId')?.trim() || undefined`.
  - Pass `resolveWorkerUserId(c) ?? null` to `findSettingsByUser` in `GET /api/killswitch-status`, and pass `resolveWorkerUserId(c)` to `botListHandler`, `botDetailHandler`, `botControlHandler`, `eventsHandler`, and `dailyStatsHandler`.

### Phase 3: D1 SQL Defense-in-Depth (`updateBot`/`patchBot`, `deleteBot`/`deleteBotRecord`)
- **Files:**
  - `src/lib/db/repo-users-bots.ts`
  - `src/lib/db/repositories.test.ts`
  - `src/forest/bot/d1-persistence-bot.ts`
  - `src/forest/bot/d1-persistence.test.ts`
  - `src/forest/api/handlers/bot-config-update.ts`
  - `src/forest/api/handlers/bot-config-update.test.ts`
  - `src/tree/bot/bot-manager-lifecycle.ts`
- **Changes:**
  - Update `updateBot(db, botId, patch, userId?: string)` and `deleteBot(db, botId, userId?: string)` to bind `WHERE id = ? AND user_id = ?` when `userId` is provided.
  - Update `patchBot(botId, patch, userId?: string)` and `deleteBotRecord(botId, userId?: string)` to forward `userId`.
  - Forward `userId` in `botUpdateConfigHandler` and `BotManagerLifecycle.patchBotSafe`.

## 3. Acceptance Criteria & Verification
- Focused and full test suites green (`npx vitest run`).
- `npm run type-check`, `npm run lint`, `npx knip` exit 0.
- Every touched file `<= 200` LOC.
