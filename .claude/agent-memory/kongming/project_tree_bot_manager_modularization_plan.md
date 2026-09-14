---
name: project_tree_bot_manager_modularization_plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; BotManager (497 LOC) modularization into cache, lifecycle, factory, facade, <= 200 LOC budget
metadata:
  type: project
---

# Tree Bot Manager Modularization & LOC Compliance Plan

**Fact/Decision:** Planned modularization of `src/tree/bot/bot-manager.ts` (497 LOC) into 4 focused modules plus type extensions, each strictly obeying the project's <= 200 LOC budget.
**Why:** `bot-manager.ts` at 497 LOC is a severe violation of the <= 200 LOC rule in `CLAUDE.md` and `development-rules.md`, acting as a God class combining cache/TTL, state mutations, exchange adapter pool, and facade/Killswitch coordination.
**How to apply:** Next implementation phases should follow `.orchestrate/latest/plan.md`:
1. `src/tree/bot/bot-manager-types.ts` (~42 LOC, ceiling <= 60 LOC) — `CachedBot`, `BotFactoryDelegate` interface.
2. `src/tree/bot/bot-manager-cache.ts` (~115 LOC, ceiling <= 140 LOC) — in-memory Map, TTL 30s, D1 direct read & fallback, IDOR defense.
3. `src/tree/bot/bot-manager-lifecycle.ts` (~80 LOC, ceiling <= 100 LOC) — state mutations (`start`, `pause`, `resume`, `stop`, `remove`, `patchBotSafe`).
4. `src/tree/bot/bot-manager-factory.ts` (~90 LOC, ceiling <= 120 LOC) — exchange adapter pool, cost queues, `createBotSync`, `createBot`, `drainQueues`, paper-only check.
5. `src/tree/bot/bot-manager.ts` (~130 LOC, ceiling <= 160 LOC) — facade class, Killswitch wiring, telemetry, singletons `getBotManager`/`resetBotManager`.
