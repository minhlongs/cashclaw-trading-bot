# Ship Report — Settings Isolation, Cloud Sync Bot Materialization & Metrics/Killswitch User Scoping

- **Date:** 2026-11-08
- **Issue:** #41
- **Branch:** `fix/settings-sync-metrics-user-isolation`
- **Plan:** `plans/261108-1845-settings-sync-metrics-user-isolation/plan.md`

## Summary of Delivered Changes

1. **Per-User `/api/settings` Isolation & `api_credentials` Synchronization:**
   - Updated `findSettingsByUser(db, userId)` in `src/lib/db/repositories.ts` to use `WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 1` so authenticated users read only their own `settings` row and never fall back to the shared `user_id IS NULL` row.
   - Threaded `userId` from `x-user-id` through `src/app/api/settings/route.ts`, `src/app/api/settings/handlers.ts`, `src/forest/settings/actions.ts`, `src/forest/settings/actions-ops.ts`, and `src/forest/settings/actions-d1.ts`, persisting rows under `id = settings_<userId>` (`user_id = userId`).
   - Added `syncExchangeToD1` in `src/forest/settings/actions-d1.ts` and invoked it from `mutateExchangeCredentials` so saving exchange credentials via `POST /api/settings` (`type: 'exchange'`) also upserts encrypted credentials into `api_credentials` (`id = cred_<userId>_<exchange>`), satisfying `botControlHandler`'s preflight check.

2. **Real Paper Bot Creation in `POST /api/ee/sync`:**
   - Wired `src/app/api/ee/sync/route.ts` to map `SyncStrategyConfig.strategyId` (`volatilityDca -> volatility_dca`, `meanReversion -> mean_reversion`, `grid -> grid`), normalize symbol format (`BTCUSDT -> BTC/USDT`), and invoke `botCreateHandler` in `mode: 'paper'` scoped to `x-user-id`.
   - Included `botId` in the `200` JSON response while preserving existing response fields (`ok`, `imported`, `tier`, `botName`, `strategyId`, `symbol`).

3. **Session Auth & Per-User Scoping on `/api/metrics` and `/api/killswitch-status`:**
   - Added `'/api/metrics'` and `'/api/killswitch-status'` to `SENSITIVE_GET_PREFIXES` in `src/middleware.ts`.
   - Updated `src/app/api/metrics/route.ts` to scope bot status counts (`WHERE user_id = ?`) and filled trade aggregates (`INNER JOIN bots b ON t.bot_id = b.id WHERE t.status = ? AND b.user_id = ?`) when `x-user-id` is present.
   - Updated `src/app/api/killswitch-status/route.ts` to extract `x-user-id` and pass it to `findSettingsByUser(db, userId)`.

## Verification Evidence
- `npm run type-check`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npx knip`: 0 unused files/exports/dependencies
- `npx vitest run`: 734 test files passed (6,167+ tests)
