---
title: "Close Per-User Settings, Cloud Sync Execution & Metrics/Killswitch Isolation Seams"
description: "Isolate /api/settings per session user and sync exchange credentials to api_credentials, wire POST /api/ee/sync to create real paper bots via botCreateHandler, and enforce session auth + per-user D1 scoping on /api/metrics and /api/killswitch-status."
status: completed
priority: P1
effort: 2h
branch: fix/settings-sync-metrics-user-isolation
issue: 41
tags: [security, tenancy, settings, ee-sync, metrics, killswitch, d1, cloudflare-workers]
---

# Plan: Close Per-User Settings, Cloud Sync Execution & Metrics/Killswitch Isolation Seams (`261108-1845`)

## 1. Objective & Root Cause Evidence

Three multi-tenant isolation and runtime execution seams remain on `main`:

1. **Cross-tenant `/api/settings` collision & missing `api_credentials` synchronization (`src/app/api/settings/route.ts`, `src/app/api/settings/handlers.ts`, `src/forest/settings/actions-d1.ts`, `src/forest/settings/actions-ops.ts`, `src/forest/settings/actions.ts`, `src/lib/db/repositories.ts`)**:
   - `loadCurrentSettings()` calls `findSettingsByUser(db, null)` and `persistSettings(data)` hardcodes `id: SETTINGS_ROW_ID ('settings_default')` and `user_id: null`. All authenticated users overwrite the same global settings row.
   - `findSettingsByUser(db, userId)` runs `WHERE user_id = ? OR user_id IS NULL`, leaking the global `user_id IS NULL` row to authenticated users who have not yet saved settings. Using `WHERE user_id IS ? ORDER BY updated_at DESC LIMIT 1` isolates each user's row when `userId` is non-null while preserving `user_id IS NULL` lookup when `userId` is `null`.
   - Updating exchange keys via `POST /api/settings` (`type: 'exchange'`) writes only `settings.exchange_creds_json` and never upserts into `api_credentials`, causing `botControlHandler`'s preflight check (`SELECT ... FROM api_credentials WHERE exchange = ? AND (user_id = ? OR user_id IS NULL)`) to fail when starting a bot.

2. **Verified `POST /api/ee/sync` bundles do not create a paper bot (`src/app/api/ee/sync/route.ts`)**:
   - After `enforceWorkspaceQuota` and `verifyAndImportCloudSyncBundle` succeed, `POST /api/ee/sync` returns `{ ok: true, imported: true, ... }` without invoking `botCreateHandler`, so synced strategies never materialize in `BotManager` or D1.

3. **Unauthenticated & unscoped `/api/metrics` and `/api/killswitch-status` (`src/middleware.ts`, `src/app/api/metrics/route.ts`, `src/app/api/killswitch-status/route.ts`)**:
   - Neither path is in `SENSITIVE_GET_PREFIXES` in `src/middleware.ts`.
   - `GET /api/metrics` aggregates all rows in `bots` and `trades` across every user instead of filtering by `x-user-id` when present.
   - `GET /api/killswitch-status` calls `findSettingsByUser(db, null)` instead of passing `x-user-id` when present.

## 2. Phases

| Phase | File | Scope | Status |
|---|---|---|---|
| Phase 01 | [phase-01-settings-isolation-and-exchange-sync.md](./phase-01-settings-isolation-and-exchange-sync.md) | Isolate `findSettingsByUser` (`WHERE user_id IS ?`), thread `userId` through settings actions/handlers/route (`settings_<userId>`), and sync exchange keys into `api_credentials` (`cred_<userId>_<exchange>`). | Completed |
| Phase 02 | [phase-02-ee-sync-paper-bot-and-metrics-scoping.md](./phase-02-ee-sync-paper-bot-and-metrics-scoping.md) | Wire `POST /api/ee/sync` to `botCreateHandler` (`mode: 'paper'`) scoped to `x-user-id`, and add `/api/metrics` + `/api/killswitch-status` to `SENSITIVE_GET_PREFIXES` with per-user D1 scoping. | Completed |

## 3. Acceptance Criteria (Done Means)

1. `GET /api/settings` and `POST /api/settings` isolate settings per `x-user-id` (`id = settings_<userId>`, `user_id = userId`) with zero cross-user leakage (`findSettingsByUser` uses `WHERE user_id IS ?`).
2. `POST /api/settings` (`type: 'exchange'`) also upserts encrypted credentials into `api_credentials` (`id = cred_<userId>_<exchange>`, `user_id = userId`) so `botControlHandler` preflight checks succeed.
3. `POST /api/ee/sync` creates a real paper bot via `botCreateHandler` (`mode: 'paper'`) scoped to `x-user-id` after SHA-256 bundle verification and quota enforcement, returning `botId` in the `200` JSON response while preserving existing response fields.
4. `src/middleware.ts` includes `/api/metrics` and `/api/killswitch-status` in `SENSITIVE_GET_PREFIXES` (`401` without session), and both routes scope D1 queries to `x-user-id` when present.
5. `npm run quality:gate` exits `0` with 0 errors, 0 warnings, 0 `:any`, and every modified file `<= 200` LOC.
