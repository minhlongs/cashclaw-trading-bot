# Phase 01 — Per-User Settings Isolation & Exchange Preflight Synchronization

## Context & Files
- `src/lib/db/repositories.ts`
- `src/forest/settings/actions-d1.ts`
- `src/forest/settings/actions-ops.ts`
- `src/forest/settings/actions.ts`
- `src/app/api/settings/handlers.ts`
- `src/app/api/settings/route.ts`
- `src/lib/db/repositories.test.ts`
- `src/forest/settings/actions.test.ts`
- `src/app/api/settings/route.test.ts`

## Steps
1. Update `findSettingsByUser(db, userId)` in `src/lib/db/repositories.ts` to query `SELECT * FROM settings WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 1` so `userId = 'u1'` matches only `user_id = 'u1'` and `userId = null` matches only `user_id IS NULL`.
2. Update `loadCurrentSettings(userId?: string)` and `persistSettings(data: SettingsData, userId?: string)` in `src/forest/settings/actions-d1.ts` to scope `id` (`userId ? \`settings_\${userId}\` : SETTINGS_ROW_ID`) and `user_id` (`userId ?? null`). Add `syncExchangeToD1(exchange, apiKey, apiSecret, testnet, userId?)` calling `upsertCredential(db, ...)` with encrypted key/secret and `id: \`cred_\${effectiveUserId}_\${exchange}\``.
3. Thread optional `userId?: string` through `src/forest/settings/actions-ops.ts`, `src/forest/settings/actions.ts`, `src/app/api/settings/handlers.ts`, and `src/app/api/settings/route.ts`.
4. Add unit tests verifying per-user settings isolation and `upsertCredential` synchronization.
