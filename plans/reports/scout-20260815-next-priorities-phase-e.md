# Next Priorities — Phase E Scout Report
**Date:** 2026-08-15 | **After:** Phase D commit (e8228b5)

## Executive Summary

Phase D fixed fabricated dashboard data and API key exposure. Four areas remain with
concrete, scorable gaps. Recommended next phase: **Auth Hardening + Monitoring Wiring**.

---

## 1. Auth Hardening — CRITICAL (unauthenticated access to sensitive endpoints)

**Outcome:** No user can call bot controls or read API keys without a valid session cookie.

**Current state (evidence):**
- `src/middleware.ts:8-13` — PROTECTED_METHODS = POST/PUT/DELETE/PATCH only. GET endpoints are **fully public**.
- `src/app/api/bots/[id]/route.ts:10-14` — GET handler has zero auth. Anyone can read any bot's capital, PnL, config.
- `src/app/api/bots/route.ts` — GET /api/bots list has zero auth.
- `src/app/api/settings/route.ts` — GET now masks keys (Phase D), but POST has no session validation (cookie presence check only).
- Middleware only calls `req.cookies.get('session')` — does NOT validate the cookie against `user_sessions` table.

**Risk:** Anyone who can reach the Worker URL can read bot data and trigger start/stop/pause/resume.

**Effort:** ~1 file changed (`middleware.ts`) to validate session cookie against D1 `user_sessions` table. ~20 lines.

**Constraint:** Cloudflare Workers use D1 — session lookup is synchronous. Cookie must contain session ID → query `SELECT * FROM user_sessions WHERE id = ? AND expires_at > unixepoch()`.

---

## 2. Monitoring Page — HIGH (pages exist, not wired to live data)

**Outcome:** Monitoring dashboard shows real killswitch state, bot metrics, and alerts from BotManager.

**Current state (evidence):**
- `src/components/monitoring/` — 8 files exist: monitoring-client.tsx, killswitch-card.tsx, bot-metrics-card.tsx, alerts-card.tsx, system-health-card.tsx, shared-components.tsx, alerts.ts, monitoring-types.ts
- `src/app/api/killswitch-status/route.ts` — calls `getBotManager().getKillswitch()` but creates a **fresh BotManager** per request (no shared state), so always returns defaults (enabled: true, halted: false, dailyPnl: 0)
- No `src/forest/monitoring/` directory — no data-fetcher or actions for monitoring

**Root cause:** BotManager is request-scoped singleton. On Cloudflare Workers, each request gets a fresh instance — killswitch state, bot metrics are lost between requests.

**Effort:** MEDIUM. Requires persisting BotManager state to D1 (capital_snapshots table already exists) or using Durable Objects for shared state.

**Non-goals:** Real-time WebSocket updates, Grafana integration.

---

## 3. Trade History — MEDIUM (events exist in D1, not surfaced in UI)

**Outcome:** Bot detail page shows recent trades/events from the `trade_events` D1 table.

**Current state (evidence):**
- `src/forest/dashboard/trade-events.ts` — `getRecentEvents()` exists, queries `trade_events` table, maps DB rows to typed events
- `src/forest/api/handlers/bot-detail.ts:86` — `recentEvents` field is optional in `BotDetail`, but handler **never populates it**
- `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:86` — `setTrades([])` hardcoded
- D1 schema (`0001_initial_schema.sql:66-72`) — `trade_events` table exists with proper indexes

**Root cause:** Integration gap — function exists, data exists, just not wired.

**Effort:** LOW. Two small changes:
1. `bot-detail.ts`: call `getRecentEvents([id])` and include in response
2. `page-client.tsx`: map API `recentEvents` → `trades` state

---

## 4. Backtest Wiring — MEDIUM (engine built, API+UI disconnected)

**Outcome:** User can select a bot, run a backtest, see real results.

**Current state (evidence):**
- `src/forest/backtest/` — FULL engine: engine.ts, metrics.ts, ohlcv.ts, paper-exchange.ts, types.ts (+ tests)
- `src/app/[locale]/backtests/backtests-client.tsx` — UI exists, calls `POST /api/backtest`
- **NO** `src/app/api/backtest/route.ts` — API endpoint does not exist
- UI shows `MOCK_RESULT` with banner "Showing sample data"
- Bot selector in UI needs bot list data (currently hardcoded `initialBots`)

**Effort:** MEDIUM-HIGH. Two parts:
1. Create `src/app/api/backtest/route.ts` (~50 lines) — validates request, runs engine, returns result
2. Wire bot list to page (pass from server component via props)

---

## Recommendation

**Next phase (E): Auth Hardening + Trade History Wiring**

Rationale:
- Auth is CRITICAL security — anyone can control bots without authentication
- Trade History is LOW effort — existing function, just not connected
- Both are small, focused fixes (≤3 files each)
- Monitoring requires architectural decision (how to share BotManager state on Workers) — defer to Phase F
- Backtest wiring is feature work, not fixing broken things — defer to Phase G

### Phase E Acceptance Criteria

1. Middleware validates session cookie against D1 `user_sessions` table for all protected API routes
2. Unauthenticated GET requests to `/api/bots`, `/api/bots/[id]`, `/api/settings` return 401
3. Bot detail API includes `recentEvents` from `trade_events` table
4. Bot detail page renders trade events (not empty array)
5. All 1372+ tests pass, `npx tsc --noEmit` clean
