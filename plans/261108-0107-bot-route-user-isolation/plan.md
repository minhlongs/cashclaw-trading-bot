---
title: "Close Cross-Tenant IDOR Seams on Bot & EE Routes via Session User Scoping"
description: "Thread session user identity (x-user-id) through forest bot handlers (list, create, detail, control, update), Next.js /api/bots and /api/bots/[id] routes, /api/ee/sync quota counting, and /api/ee/billing/checkout workspace fallback."
status: completed
priority: P1
effort: 2h
branch: fix/bot-route-user-isolation
issue: 39
linked_pr: 40
tags: [security, tenancy, idor, bots, ee, d1, cloudflare-workers]
---

# Plan: Close Cross-Tenant IDOR Seams on Bot & EE Routes (`261108-0107`)

## 1. Objective & Root Cause Evidence

While `BotManager` (`src/tree/bot/bot-manager-core.ts`), `BotQueryService` (`src/forest/bot/bot-query-service-class.ts`), and `botUpdateConfigHandler` (`src/forest/api/handlers/bot-config-update.ts`) already implement `userId` anti-IDOR scoping (`findBotsByUser`, `getBot(id, userId)`, `getOrCreateBot(id, userId)`, `createBot(req, userId)` with `if (effectiveUserId) persistNewBot(...)`), the HTTP route layer and forest handlers do not thread the session-verified `x-user-id` header down:

1. **Cross-tenant bot list leak (`src/app/api/bots/route.ts:47`, `src/forest/api/handlers/bot-list.ts:23`)**:
   - `botListHandler()` accepts no `userId` and calls `new BotQueryService().listBots()` with no argument, returning every tenant's bots on `GET /api/bots`.
2. **Ownerless & unpersisted bot creation (`src/app/api/bots/route.ts:82`, `src/forest/api/handlers/bot-create.ts:16`, `src/tree/bot/bot-manager-factory.ts:72`)**:
   - `botCreateHandler(payload)` does not accept or forward `userId` to `getBotManager().createBot(botConfig, userId)`. Because `effectiveUserId` is `undefined`, `if (effectiveUserId) persistNewBot(...)` is skipped — bots created via `POST /api/bots` carry no owner and are never written to D1.
3. **Cross-tenant quota counting (`src/app/api/bots/route.ts:71`, `src/app/api/ee/sync/route.ts:16`)**:
   - Both routes pass unscoped `botListHandler` to `resolveActiveBotCount`, so Tenant A's bots count against Tenant B's `maxRunningBots` quota.
4. **Cross-tenant IDOR on `/api/bots/[id]` (`src/app/api/bots/[id]/route.ts:11,17,28`, `src/forest/api/handlers/bot-detail.ts:8`, `src/forest/api/handlers/bot-control.ts:39`, `src/forest/api/handlers/bot-detail-control.ts:4`)**:
   - `GET`, `POST`, and `PATCH` on `/api/bots/[id]` never read `x-user-id` or pass `userId` to `botDetailHandler`, `botControlHandler`, or `botUpdateConfigHandler`.
5. **Unenrolled session user checkout fallback (`src/app/api/ee/billing/checkout/route.ts:24`)**:
   - `resolveCheckoutWorkspace` returns `null` (`401 WORKSPACE_UNRESOLVED`) when D1 is unavailable or returns no membership row, instead of falling back to `resolveEffectiveWorkspaceId(req, resolved.workspaceId, explicitWorkspaceId)` (`ws_<safeUserId>`).

## 2. Phases

| Phase | File | Scope | Status |
|---|---|---|---|
| Phase 01 | [phase-01-forest-bot-handlers-user-scoping.md](./phase-01-forest-bot-handlers-user-scoping.md) | Thread optional `userId?: string` through `botListHandler`, `botCreateHandler`, `botDetailHandler`, `botControlHandler` (`bot-control.ts`), and `executeBotControl` (`bot-detail-control.ts`) + handler unit tests. | In Progress |
| Phase 02 | [phase-02-nextjs-bot-and-ee-routes-isolation.md](./phase-02-nextjs-bot-and-ee-routes-isolation.md) | Wire `x-user-id` in `/api/bots`, `/api/bots/[id]`, `/api/ee/sync`, and `resolveEffectiveWorkspaceId` fallback in `/api/ee/billing/checkout` + route integration tests. | In Progress |

## 3. Acceptance Criteria (Done Means)

1. `botListHandler(userId?: string)` forwards `userId` to `BotQueryService.listBots(userId)`; `GET /api/bots` passes session `x-user-id` and returns only that user's bots.
2. `POST /api/bots` and `POST /api/ee/sync` pass `() => botListHandler(userId)` into `resolveActiveBotCount`, counting only the session user's bots toward quota.
3. `botCreateHandler(payload, userId?: string)` forwards `userId` to `getBotManager().createBot(botConfig, userId)`, binding the created bot to the session user and triggering D1 persistence (`persistNewBot`).
4. `botDetailHandler(id, userId?)`, `botControlHandler(id, action, userId?)`, and `GET / POST / PATCH /api/bots/[id]` enforce owner scoping and return HTTP `404` when a bot does not exist or belongs to another user.
5. `POST /api/ee/billing/checkout` falls back to `resolveEffectiveWorkspaceId` (`ws_<safeUserId>`) when D1 membership lookup yields no workspace.
6. Comprehensive unit and route tests cover all 5 seams; Hono `/internal/api/bots` operator routes remain unchanged.
7. `npm run quality:gate` exits `0` with 0 errors, 0 warnings, 0 `:any`, and every modified file `<= 200` LOC.
