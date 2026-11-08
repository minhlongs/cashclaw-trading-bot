# Phase 01: Forest Bot Handlers Optional `userId` Scoping

## Context & Requirements
- Preserve backward compatibility for internal/operator callers (`src/worker-api-routes.ts`) by keeping `userId?: string` optional across all forest handlers.
- When `userId` is provided, enforce strict owner scoping via `BotQueryService` and `BotManager`.

## Files Owned
- `src/forest/api/handlers/bot-list.ts`
- `src/forest/api/handlers/bot-create.ts`
- `src/forest/api/handlers/bot-detail.ts`
- `src/forest/api/handlers/bot-detail-control.ts`
- `src/forest/api/handlers/bot-control.ts`
- `src/forest/api/handlers/bot-list.test.ts`
- `src/forest/api/handlers/bot-create.test.ts`
- `src/forest/api/handlers/bot-detail.test.ts`
- `src/forest/api/handlers/bot-control.test.ts`

## Steps
1. Update `botListHandler(userId?: string)` in `src/forest/api/handlers/bot-list.ts` to call `service.listBots(userId)`.
2. Update `botCreateHandler(payload: CreateBotPayload, userId?: string)` in `src/forest/api/handlers/bot-create.ts` to call `getBotManager().createBot(botConfig, userId)`.
3. Update `botDetailHandler(id: string, userId?: string)` and `botControlHandler(botId: string, action: BotControlAction, userId?: string)` in `src/forest/api/handlers/bot-detail.ts` and `executeBotControl(botId: string, action: BotControlAction, userId?: string)` in `src/forest/api/handlers/bot-detail-control.ts` to pass `userId` to `manager.getBot(id, userId)`, `manager.getOrCreateBot(id, userId)`, and `manager.resumeBot(id, userId)`.
4. Update `botControlHandler(id: string, action: ..., userId?: string)` and `validateStartCredentials(id: string, userId?: string)` in `src/forest/api/handlers/bot-control.ts` to pass `userId` to `manager.getBot(id, userId)`, `manager.getOrCreateBot(id, userId)`, and `manager.resumeBot(id, userId)`.
5. Add unit tests verifying `userId` forwarding and cross-user denial in `bot-list.test.ts`, `bot-create.test.ts`, `bot-detail.test.ts`, and `bot-control.test.ts`.

## Validation
- `npx vitest run src/forest/api/handlers/bot-list.test.ts src/forest/api/handlers/bot-create.test.ts src/forest/api/handlers/bot-detail.test.ts src/forest/api/handlers/bot-control.test.ts src/forest/api/handlers/bot-config-update.test.ts`
