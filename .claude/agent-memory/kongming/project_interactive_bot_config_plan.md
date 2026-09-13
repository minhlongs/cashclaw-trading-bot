---
name: project-interactive-bot-config-plan
description: 2026-09-13 plan at .orchestrate/latest/plan.md; interactive bot config update form, PATCH endpoint, D1 persistence, <= 200 LOC budget.
metadata:
  type: project
---

Interactive Bot Configuration Update Wiring & D1 Persistence planned for execution.

**Why:**
The bot inspection Config tab (`/bots/[id]` -> Config tab) previously rendered static inputs without change handlers and a non-functional "Save Config" button. Operators could not tune live parameters (grid spacing, levels, capital per level, take profit, stop loss) or persist them to Cloudflare D1.

**How to apply:**
The execution plan is saved at `.orchestrate/latest/plan.md`.
Key architectural decisions & invariants:
- **LOC budget**: All touched and new files must remain strictly $\le 200$ LOC (`wc -l`). Multi-line imports in `bot-instance.ts` will be compacted before adding `updateConfig`.
- **Backend**: New `botUpdateConfigHandler` in `src/forest/api/handlers/bot-config-update.ts` handles parameter validation, bounds coercion, anti-IDOR verification, D1 persistence via `patchBot`, and in-memory cache update.
- **API**: `PATCH /api/bots/[id]` added to `src/app/api/bots/[id]/route.ts`.
- **UI**: `BotDetailConfig` receives `botId` and `onConfigSaved`, manages local state, displays `Loader2` during mutations, and renders semantic token alert feedback.
- **Safety**: ADR-001 paper-only invariant preserved (`mode: 'paper'`).
- **Deploy**: Full pre-deploy quality gate -> commit -> `npm run deploy` -> live production smoke tests -> rollback verification.
