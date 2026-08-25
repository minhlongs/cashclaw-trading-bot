---
title: "BotManager Cold-Start Hydration Fix"
description: "Fix incomplete D1 hydration so bot status, scheduler, and cron survive Cloudflare Workers cold starts"
status: pending
priority: P1
effort: 3h
branch: main
tags: [bot-manager, d1, cold-start, hydration, cloudflare-workers]
created: 2026-08-20
---

# BotManager Cold-Start Hydration Fix

## Problem Statement

After a Cloudflare Workers cold start, BotManager's in-memory `Map<string, BotInstance>` is empty. While API handlers already call `loadAllBotsFromD1()` before accessing the manager, two critical gaps exist:

1. **Status not restored**: `restoreBotStateFromRow()` never patches the `status` field — all hydrated bots report `idle` regardless of their D1 state (`paper_test`, `paused`, etc.)
2. **Scheduler blind**: `BotScheduler.tick()` and CF Cron `scheduled()` do NOT hydrate — after cold start, no bots are ticked and queue drain runs on an empty manager

## Architecture Decision

**Approach: Enhanced D1 Hydration (not Durable Objects)**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Durable Objects | REJECT | Overkill for paper trading; adds complexity (DO per bot, storage API, alarm scheduling) with no benefit over D1 queries |
| Direct D1 (no BotInstance) | REJECT | Would require rewriting all handlers to query D1 directly instead of using BotManager; massive scope |
| Enhanced D1 hydration | ACCEPT | Fix the two gaps in existing infrastructure; minimal code changes; preserves all existing patterns |

**Why not DO**: Paper/backtest only, single-user v1, bots are lightweight config+metrics objects. The existing `loadAllBotsFromD1()` pattern already works for API handlers — we just need to complete it.

## What State Is Persisted vs. Ephemeral

| State | Where | Persisted to D1? | Hydrated? |
|-------|-------|-------------------|-----------|
| Bot config (strategy, symbol, capital, params) | `BotInstance.config` | Yes (`config_json`) | Yes |
| Metrics (PnL, trades, win/loss, drawdown) | `BotInstance.state` | Yes (individual columns) | Yes |
| **Bot status** (`running`/`paused`/`stopped`/`idle`) | `BotInstance.state.status` | Yes (`status` column) | **NO — BUG** |
| Timestamps (startedAt, stoppedAt, lastTickAt) | `BotInstance.state` | Yes (individual columns) | Yes |
| Exchange adapter instance | `BotManager.exchanges` | No | Rebuilt by `createBot()` |
| Request queues | `BotManager.queues` | No | Rebuilt by `createBot()` |
| Killswitch daily state | `Killswitch` | Yes (settings row) | Not hydrated (reconstructed on first eval) |
| Strategy instance + grid levels | `BotInstance.strategy` | No | Must call `bot.start()` to reinitialize |

**Key insight**: After hydration, a bot with D1 status `paper_test` (running) is reconstructed as `idle`. The strategy must be reinitialized via `bot.start()` to resume ticking. This is correct behavior — the ticker price is needed to set up grid levels.

## Changes Required

### Phase 1: Restore status from D1 (1h)

**File: `src/forest/bot/d1-hydration.ts`**

Add a D1→BotStatus reverse mapping and patch `status` in `restoreBotStateFromRow`:

```ts
// Add reverse mapping (D1 status → BotStatus)
function toBotStatus(d1Status: string): BotStatus {
  switch (d1Status) {
    case 'paper_test': return 'running';
    case 'live_running': return 'running';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    case 'draft': return 'idle';
    default: return 'idle';
  }
}
```

In `restoreBotStateFromRow`, add the status patch. The row already has a `status` field (it's in the `Bot` type from `lib/db/types.ts:60`).

**Impact**: After hydration, API handlers return the correct status. Bots that were `paused` show as `paused`, not `idle`.

**Note on running bots**: Bots with D1 status `paper_test` will hydrate as `running` in status but will NOT have a live strategy/tick cycle. This is correct — `BotInstance.start()` must be called to initialize the strategy with a fresh ticker price. The status accurately reflects "this bot should be running" even though the tick loop hasn't started yet. The scheduler handles the gap (see Phase 2).

### Phase 2: Hydrate at scheduler entry points (1h)

**File: `src/forest/bot/scheduler.ts`**

Add hydration at the top of `BotScheduler.tick()`:

```ts
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

async tick(): Promise<SchedulerTickReport> {
  this.tickCount++;
  const now = this.deps.getNow?.() ?? Date.now();
  this.lastTickAt = now;
  this.rateLimitCounts.clear();

  // Hydrate bots from D1 on cold start (idempotent — skips already-loaded bots)
  await loadAllBotsFromD1();
  
  const killswitch = getBotManager().getKillswitch();
  // ... rest unchanged
```

**File: `src/worker.ts`**

Add hydration at the top of `scheduled()`:

```ts
import { loadAllBotsFromD1 } from './forest/bot/d1-adapter';

export async function scheduled(...): Promise<void> {
  await loadAllBotsFromD1();
  const manager = getBotManager();
  const report = await manager.drainQueues();
  // ... rest unchanged
```

**File: `src/worker.ts`** — `/api/health` route

```ts
app.get('/api/health', async (c) => {
  await loadAllBotsFromD1();
  const manager = getBotManager();
  // ... rest unchanged
```

**Impact**: After cold start, CF Cron drainQueues and scheduler tick both operate on hydrated bot state.

### Phase 3: Auto-restart running bots after hydration (30min)

After hydration, bots with D1 status `paper_test` are in-memory as `running` but have no strategy or tick cycle. Two options:

**Option A (Recommended): Scheduler auto-starts**
In `BotScheduler.tick()`, after hydration, auto-start bots that are `running` but have no strategy:

```ts
const runningBots = manager.getRunningBots();
for (const bot of runningBots) {
  if (!bot.hasStrategy()) {
    await bot.start(); // reinitializes strategy with fresh ticker
  }
}
```

This requires adding a `hasStrategy()` public method to `BotInstance` (one-liner: `return this.strategy !== null`).

**Option B: Leave idle, let user manually restart**
Simpler but worse UX — user sees running bots that aren't actually ticking.

**Decision**: Option A. Paper trading only, auto-restart is safe and matches user expectations.

**File: `src/tree/bot/bot-instance.ts`**

Add public method:
```ts
hasStrategy(): boolean {
  return this.strategy !== null;
}
```

**File: `src/forest/bot/scheduler.ts`**

After hydration and before the main tick loop:
```ts
// Auto-restart bots that were running before cold start
for (const bot of manager.getRunningBots()) {
  if (!bot.hasStrategy()) {
    try {
      await bot.start();
    } catch (err) {
      errors.push({ botId: bot.id, message: `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
```

### Phase 4: Tests (30min)

**Update: `src/forest/bot/d1-hydration.test.ts`**
- Add test: bot with D1 status `paper_test` hydrates with BotStatus `running`
- Add test: bot with D1 status `paused` hydrates with BotStatus `paused`
- Add test: bot with D1 status `stopped` hydrates with BotStatus `stopped`
- Verify `toBotStatus` reverse mapping for all D1 status values

**Update: `src/forest/bot/scheduler.test.ts`**
- Add test: `tick()` calls `loadAllBotsFromD1` before accessing manager
- Add test: running bots without strategy are auto-started

**Update: `src/tree/bot/bot-instance.test.ts`**
- Add test: `hasStrategy()` returns false initially, true after `start()`

**Update: `src/worker.test.ts`**
- Add test: `scheduled()` calls `loadAllBotsFromD1` before drainQueues

## Migration Path

1. No schema changes — D1 `bots.status` column already exists and is populated
2. No API contract changes — same response shapes
3. No new dependencies
4. Deploy is a single `wrangler deploy`

## File Ownership

| Phase | Files Modified | Files Created |
|-------|---------------|---------------|
| Phase 1 | `src/forest/bot/d1-hydration.ts` | None |
| Phase 2 | `src/forest/bot/scheduler.ts`, `src/worker.ts` | None |
| Phase 3 | `src/tree/bot/bot-instance.ts`, `src/forest/bot/scheduler.ts` | None |
| Phase 4 | `*.test.ts` files | None |

No parallel phase conflicts — sequential execution is safe.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| D1 query fails on cold start | Low | High | `loadAllBotsFromD1` already returns gracefully on null DB; handlers continue with empty manager |
| Auto-restart fails (exchange unreachable) | Medium | Low | Caught by try/catch, bot stays `idle`, user can retry manually |
| `createBot()` called twice for same bot (redundant persist) | High | Low | Existing `hydratedBotIds` Set prevents this; `persistBot` is idempotent (INSERT OR REPLACE) |
| `loadAllBotsFromD1` called from many handlers (D1 query per request) | High | Low | `hydratedBotIds` Set ensures D1 query only runs once per isolate lifecycle; subsequent calls are no-ops |

## Rollback Plan

Revert the commits for each phase independently:
- Phase 1: Revert `restoreBotStateFromRow` status patch — bots show `idle` again (current behavior)
- Phase 2: Remove `loadAllBotsFromD1` calls from scheduler/cron — scheduler blind again (current behavior)
- Phase 3: Remove auto-restart logic — bots stay `idle` after hydration (current behavior)

## Success Criteria

- [ ] After cold start, `GET /api/bots` returns correct status for each bot (not all `idle`)
- [ ] After cold start, `GET /api/health` shows accurate bot count
- [ ] After cold start, CF Cron `scheduled()` drains queues from hydrated manager
- [ ] After cold start, `BotScheduler.tick()` evaluates running bots
- [ ] Running bots auto-restart with fresh strategy after hydration
- [ ] All existing tests pass (2003/2003)
- [ ] New tests prove cold-start hydration restores status and scheduler hydrates

## Unresolved Questions

1. **Killswitch daily state**: Currently persisted to D1 settings row but not re-hydrated on cold start. Killswitch starts with default thresholds. Should we hydrate it? (Low priority — defaults are safe for paper trading)
2. **Exchange credentials**: `loadAllBotsFromD1` passes empty credentials to `createBot`. If a bot was running, auto-restart via scheduler would fail because `bot.start()` needs a ticker from the exchange. The scheduler should pass real credentials. (Defer to credential hydration task if needed)
