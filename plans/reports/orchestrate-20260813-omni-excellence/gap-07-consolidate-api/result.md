# GAP 7: Consolidate Dual API Surface — Result

## Status: COMPLETED

## What was done

Both Hono (`worker.ts`) and Next.js App Router (`src/app/api/bots/`) served `/api/bots`, creating a route collision in the Cloudflare Worker deployment. The Hono routes would intercept `/api/bots` requests before Next.js middleware could apply session-cookie auth guards.

### Changes

| File | Change |
|---|---|
| `src/worker.ts` | Renamed `/api/bots/*` to `/internal/api/bots/*` (3 routes: list, detail, control). Added comprehensive header comment documenting the API surface split. Fixed `as any` cast to proper union type. |
| `src/app/api/bots/route.ts` | Added header comment documenting this as the canonical user-facing `/api/bots` endpoint. |
| `src/app/api/bots/[id]/route.ts` | Added header comment documenting session-cookie auth and pointing to Hono internal routes. |
| `src/forest/api/routes.ts` | Updated JSDoc to document the API surface split between Next.js and Hono. |
| `src/middleware.ts` | Added comment clarifying this middleware applies to Next.js routes only, not Hono. |

### Route map after consolidation

**Next.js App Router** (session-cookie auth via `src/middleware.ts`):
- `GET /api/bots` — list bots
- `POST /api/bots` — create bot
- `GET /api/bots/[id]` — bot detail
- `POST /api/bots/[id]` — control action (start/stop/pause/resume)
- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/POST /api/settings`

**Hono Worker** (Bearer token auth via `auth-guard.ts`):
- `GET /internal/api/bots` — operator list bots
- `GET /internal/api/bots/:id` — operator bot detail
- `POST /internal/api/bots/:id/:action` — operator control action
- `POST /api/killswitch/halt`, `POST /api/killswitch/resume`
- `GET /api/events`
- `GET /api/stats/daily`
- `POST /api/cron/eval`
- `GET /api/health`, `GET /api/version`

## Verification

- `tsc --noEmit`: PASS (same 2 pre-existing test-file errors only, not introduced by this change)
- Route conflict: ELIMINATED — `/api/bots` served by Next.js only; Hono uses `/internal/api/bots`
- Auth split: clear — Next.js uses session cookies, Hono uses Bearer tokens
- Client-side `fetch('/api/bots')` calls continue to hit Next.js routes (unchanged)
