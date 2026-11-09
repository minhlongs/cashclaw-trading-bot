# Plan: Issue #54 — Multi-Tenant Scoping for Bots Rate-Limit, getBotMetrics, Killswitch D1 Sync & D1 Callback/Hydration

- **Issue:** #54
- **Branch:** `feat/issue-54-ratelimit-metrics-killswitch-d1-scoping`
- **Status:** completed
- **Date:** 2026-11-09

## 1. Objective
Close the remaining multi-tenant (`userId`) isolation and D1 state synchronization seams across `POST /api/bots` rate limiting, `BotQueryService.getBotMetrics`, Killswitch D1 persistence (`killswitchHaltHandler` / `killswitchResumeHandler` / dashboard actions / Hono Worker routes), `createD1Callbacks`, and `hydrateFromD1` / `loadAllBotsFromD1`.

## 2. Phases & File Ownership

### Phase 1: Per-User Rate Limiting on `POST /api/bots` & `BotQueryService.getBotMetrics` Scoping
- **Files:**
  - `src/app/api/bots/route.ts`
  - `src/app/api/bots/route.test.ts`
  - `src/forest/bot/bot-query-service-class.ts`
  - `src/forest/bot/d1-adapter.test.ts`
- **Changes:**
  - Extract `x-user-id` before `checkRateLimit(userId ? \`bots:create:${userId}\` : 'bots:create')` in `POST /api/bots`.
  - Add optional `userId?: string` to `BotQueryService.getBotMetrics(id: string, userId?: string)` to bind `WHERE id = ? AND user_id = ?` when `userId` is provided.

### Phase 2: Killswitch D1 State Synchronization & Multi-Tenant `userId` Forwarding
- **Files:**
  - `src/forest/api/handlers/killswitch.ts`
  - `src/forest/api/handlers/killswitch.test.ts`
  - `src/forest/dashboard/bot-actions.ts`
  - `src/forest/dashboard/bot-actions.test.ts`
  - `src/worker-api-routes.ts`
  - `src/worker.test.ts`
- **Changes:**
  - Update `killswitchHaltHandler(reason: string, userId?: string)` and `killswitchResumeHandler(userId?: string)` to call `await emergencyHalt(reason, userId)` and `await resumeFromHalt(userId)` alongside `getBotManager().manualHalt(reason)` / `manualResume()`.
  - Forward `userId` in `killswitchActionHalt(reason, userId?)` / `killswitchActionResume(userId?)` and Hono Worker `POST /api/killswitch/halt` & `POST /api/killswitch/resume`.

### Phase 3: D1 Callback & Hydration `userId` Propagation
- **Files:**
  - `src/tree/bot/bot-manager-helpers.ts`
  - `src/tree/bot/bot-manager-helpers.test.ts`
  - `src/forest/bot/d1-hydration-impl.ts`
  - `src/forest/bot/d1-hydration.test.ts`
- **Changes:**
  - Forward `deps.userId || undefined` to `patchBot(deps.botId, ..., deps.userId || undefined)` in `createD1Callbacks`.
  - Forward `ownerUserId` (`row.user_id || userId || undefined`) to `manager.createBot(..., ownerUserId)` in `createBotFromRow` (`src/forest/bot/d1-hydration-impl.ts`).

## 3. Acceptance Criteria & Verification
- Focused and full test suites green (`npx vitest run` — 734/734 files, 6,186/6,186 tests).
- `npm run type-check`, `npm run lint`, `npx knip` exit 0.
- Every touched file `<= 200` LOC.
