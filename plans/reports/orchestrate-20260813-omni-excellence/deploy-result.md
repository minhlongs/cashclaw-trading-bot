# Deployment Report

## Status: SUCCESS

## Deployment Details

- **Worker Name:** cashclaw-trading-bot
- **Version ID:** a61f7a53-6ff4-41a2-9c37-c0ca5710da18
- **Deployment URL:** https://cashclaw-trading-bot.agencyos-openclaw.workers.dev
- **Deployed At:** 2026-08-13

## HTTP Status Codes

| Route | Status |
|---|---|
| `/` | 307 → 200 (redirect to locale) |
| `/` (following redirects) | 200 OK |

## Build & Deploy Stats

- **Build Time:** ~10s TypeScript
- **Upload Size:** 5866.67 KiB / gzip: 1224.96 KiB
- **Worker Startup Time:** 42 ms
- **Deploy Time:** ~17s upload + ~6s triggers

## Bindings

- `env.DB` — cashclaw-db (D1 Database)
- `env.NEXT_INC_CACHE_R2_BUCKET` — cashclaw-opennext-cache (R2 Bucket)
- `env.WORKER_SELF_REFERENCE` — cashclaw-trading-bot (Worker)
- `env.IMAGES` — Images
- `env.ASSETS` — Assets

## Errors

None. Deployment completed successfully on first attempt via `opennextjs-cloudflare deploy` (called by wrangler).
