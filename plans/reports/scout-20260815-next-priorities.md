# Scout Report: Next Priority Recommendations

**Date:** 2026-08-15
**Trigger:** `/ak-brainstorm next? --auto --parallel`
**Scouts:** 3 parallel agents — fabricated data, auth posture, queue state

---

## Executive Summary

Three parallel investigations produced one clear finding: **the dashboard and bots pages show fabricated financial figures to customers as real data.** This is the single highest-impact problem in the product right now — not security, not the queue, not new features. Fixing it is also the cheapest path because most of the real data already exists in D1 and just isn't surfaced.

---

## Scout 1: Fabricated Customer-Facing Data (32 findings)

### CRITICAL — Invented Financial Figures

| ID | What Customer Sees | Root Cause | Fix Category |
|---|---|---|---|
| F1 | "Capital Deployed $2,450 / $5,000" with 49% bar | Hardcoded string in dashboard-client.tsx:209,211 | Wire-up: `cfg.capital` exists in D1 |
| F2 | "Capital Used $2,450 / $5,000" in Efficiency panel | Hardcoded string in dashboard-client.tsx:292,295 + bot-detail.ts:75 (`Math.round(cfg.capital * 0.49)`) | Partial wire-up (allocated) + build tracking (used) |
| F3 | "Total Balance -$500" (PnL only, capital omitted) | dashboard-client.tsx:89 sums totalPnl, ignores capital | Wire-up: `bot-kpis.ts:81` has correct formula |
| F4 | "Today PnL: $X" but shows ALL-TIME PnL | dashboard-client.tsx:90 uses totalPnl, not daily | **Build tracking**: `capital_snapshots` table unused, `persistSnapshot()` never called |
| F5 | "Max Drawdown -0%" on every bot | `BotState.maxDrawdown` initialized to 0, never assigned | **Build tracking** |
| F6 | "Win Rate 100%" on every bot | Paper adapter stamps `pnl: 0` on every fill; winCount increments when `pnl >= 0` (always true) | **Build tracking**: proper fill-vs-entry PnL attribution |
| F7 | "Created: [last-started date]" | bot-detail-overview.ts:51 reads `startedAt`, not `created_at` | Wire-up: `bots.created_at` exists in D1 |
| F8 | "Bot Name: btc_grid_001" (raw ID everywhere) | create-bot.ts:118 writes `name: req.id` instead of `req.name` | Wire-up: write `req.name` |
| F9 | "No trades yet" even with active bots | getTradeHistory queries `trade_events` (empty), trades live in `trades` table | Wire-up: repoint query |
| F10 | Bot detail page: permanent "Bot not found" | Client reads `{ bot, trades }`, API returns `{ ok, data: {...} }` | Wire-up: fix contract |
| F11 | Bots list: permanent "Failed to fetch bots" | Client reads `data.bots`, API returns `data` (array) | Wire-up: fix contract |
| F12 | Backtest page: full fabricated equity curve + trades | `MOCK_RESULT` hardcoded, API route `/api/backtest` doesn't exist | Wire-up: engine exists, API route missing |

### HIGH — Mislabeled or Misleading

| ID | What Customer Sees | Fix Category |
|---|---|---|
| F13 | Trade History: status always "filled" (tautological) | Wire-up: query `trades` table |
| F14 | Bot config silently discarded at creation | Wire-up: handler ignores `payload.config` |
| F15 | Monitoring: all zeros (BotManager never hydrated) | Wire-up: call `loadAllBotsFromD1()` |
| F16 | Killswitch status: fresh instance, always "Binh thuong" | **Build tracking**: no persistence for halt state |
| F17 | Monitoring page: 404 on `/api/killswitch` and `/api/alerts` | Wire-up (killswitch-status exists) + build (alerts) |
| F18 | ROI: `+-8.31%` for losers, `+NaN%` for zero-capital | Fix sign logic and zero-guard |
| F19 | Telegram settings: save shows "saved" but persists nothing | **Build**: no telegram persistence |
| F20 | Dashboard renders Win Rate panel twice | Remove duplicate |

### Key Insight: Wire-Up vs. Build Tracking

- **15 findings = wire-up** (data exists in D1, just not surfaced through API or rendered correctly)
- **7 findings = build tracking** (underlying data not computed/persisted yet)
- Wire-up fixes are cheap and high-impact; build-tracking fixes are expensive and should be phased

---

## Scout 2: Auth Posture

### Verdict: Real security gap, but scope is narrower than originally proposed

**What exists:**
- DB-backed auth system: SHA-256 passcode, session tokens, httpOnly cookies, login route, `/api/auth/me` route
- Login UI (bilingual, labeled "Internal Tool")
- Middleware at `src/middleware.ts` that guards `/api/bots` and `/api/settings`

**What's broken:**

1. **CRITICAL: `GET /api/settings` returns plaintext exchange API keys and secrets to anyone.** No identity check on GET routes. Middleware only blocks POST.

2. **HIGH: Middleware auth is cookie-presence only** (line 36-43: checks `req.cookies.get('session_id')?.value` exists, never validates against `user_sessions` table). `curl -H 'Cookie: session_id=anything'` bypasses all mutation guards.

3. **MEDIUM: Login page is decorative.** No page/layout redirects to login. Dashboard fully browsable without authenticating.

4. **LOW: CLAUDE.md claims middleware "bypasses API routes and redirects to vi" — both false.** Middleware specifically guards API routes and does zero locale redirecting.

**De-facto single-tenant.** Schema has `user_id` columns but runtime ignores them. `loadAllBotsFromD1()` comment says "no userId filter — single-user v1." Only one user exists (`admin@cashclaw.app`). Cross-tenant data leak is not a current risk.

**Recommended auth fixes (ordered):**
1. Mask `apiKey`/`apiSecret` in GET `/api/settings` response (immediate — stops credential leakage)
2. Add real session validation to middleware or route handlers (stops forged-cookie bypass)
3. Gate dashboard pages behind auth OR remove login page and acknowledge unauthenticated internal tool

---

## Scout 3: Cost-Aware Request Queue (Phase 2 Plan)

### Verdict: 100% implemented, architecturally broken, and premature for paper-only v1

**What exists:** All 7 files from the plan plus 2 extras (queued-adapter.ts + test). 43 tests passing. Fully wired into `BotManager` → `Scheduler` drain path.

**What's broken:** `QueuedExchangeAdapter.enqueueAndWait()` enqueues an item and immediately dequeues it in the same synchronous call. No item ever waits behind another. Priority sorting has zero effect. The queue is architecturally a no-op for its stated purpose.

**Why it's premature:** v1 is paper-only (`bot-create.ts:26-30` hard-rejects live mode). There are no real API rate limits or costs to manage. The queue's value proposition is zero.

**Recommendation:** Do not continue this work. Mark the plan as superseded. If/when live trading ships, the queue needs a fundamental redesign (async resolution model), not completion of the current broken implementation.

---

## Recommended Next Phase: Phase D — Fix Fabricated Dashboard Data

### Outcome
Dashboard and bots pages show real data from D1 instead of hardcoded values. Customer sees accurate capital, balance, bot names, and trade history.

### Constraints
- Wire-up only for this phase (15 findings). Build-tracking items (today PnL, capital used, drawdown) are Phase E.
- Preserve existing Zod schemas and API contracts — extend, don't break.
- All existing 1373 tests must keep passing.

### Non-Goals
- Per-day PnL tracking (requires cron/snapshot infrastructure)
- Capital utilization tracking (requires position tracking)
- Drawdown tracking (requires high-water-mark state)
- Auth hardening (separate phase)
- Backtest wiring (separate phase — engine exists but needs API route + UI fix)

### Acceptance Criteria
- [ ] Dashboard "Capital Deployed" shows real `sum(bots.capital)` / not hardcoded
- [ ] Dashboard "Total Balance" = capital + PnL (not PnL alone)
- [ ] Dashboard "Today PnL" label corrected to "Total PnL" (until daily tracking exists)
- [ ] Dashboard Win Rate panel appears once, not twice
- [ ] Bot list page shows bots (fix `data.bots` → `data` contract mismatch)
- [ ] Bot detail page shows bot (fix `{ bot, trades }` → `{ ok, data }` contract mismatch)
- [ ] Bot names show `req.name`, not `req.id`
- [ ] Bot "Created" shows creation date, not last-started date
- [ ] Trade History queries `trades` table, not empty `trade_events`
- [ ] Monitoring page calls `loadAllBotsFromD1()` before reading metrics
- [ ] Killswitch status reads persisted state, not fresh constructor defaults
- [ ] `GET /api/settings` masks `apiKey`/`apiSecret` (security — ships with this phase because it's 1 line)

### Estimated Scope
~12 files modified, ~2-3 new tests, ~4h effort. Mostly field-mapping and API response shape fixes.
