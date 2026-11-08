# Phase 02 — Cloud Sync Paper Bot Creation & `/api/metrics` + `/api/killswitch-status` Scoping

## Context & Files
- `src/app/api/ee/sync/route.ts`
- `src/middleware.ts`
- `src/app/api/metrics/route.ts`
- `src/app/api/killswitch-status/route.ts`
- `src/middleware.test.ts`
- `src/app/api/ee/__tests__/ee-routes.test.ts`
- `src/ee/__tests__/runtime-seams-e2e.test.ts`
- `src/app/api/metrics/route.test.ts`
- `src/app/api/killswitch-status/route.test.ts`

## Steps
1. In `src/app/api/ee/sync/route.ts`, map `importResult.data.strategyId` (`volatilityDca -> volatility_dca`, `meanReversion -> mean_reversion`, `grid -> grid`), normalize symbol to pair format (`BTCUSDT -> BTC/USDT` when needed), and invoke `botCreateHandler` with `mode: 'paper'` and `userId`. Return `botId` in the 200 JSON payload alongside existing fields.
2. In `src/middleware.ts`, add `'/api/metrics'` and `'/api/killswitch-status'` to `SENSITIVE_GET_PREFIXES`.
3. In `src/app/api/metrics/route.ts`, accept `req?: Request`, extract `x-user-id`, and scope bot status counts (`WHERE user_id = ?`) and filled trade aggregates (`INNER JOIN bots b ON t.bot_id = b.id WHERE t.status = ? AND b.user_id = ?`) when `userId` is present.
4. In `src/app/api/killswitch-status/route.ts`, accept `req?: Request`, extract `x-user-id`, and pass `userId` to `findSettingsByUser(db, userId)`.
5. Update `src/middleware.test.ts` and add route unit/integration tests for `/api/ee/sync`, `/api/metrics`, and `/api/killswitch-status`.
