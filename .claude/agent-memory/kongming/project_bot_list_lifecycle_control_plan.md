---
name: project-bot-list-lifecycle-control-plan
description: Interactive Bot List Lifecycle Control Actions and Component Modularization planned for CashClaw trading bot
metadata:
  type: project
---

Interactive Bot List Lifecycle Control Actions & Modularization plan written to `.orchestrate/latest/plan.md` on 2026-09-13.

**Why:**
`src/components/bots/bots-list-client.tsx` was at 230 LOC (violating the strict <= 200 LOC ceiling), and row Pause/Play buttons were static stubs without onClick handlers or mutation dispatching to `POST /api/bots/[id]`.

**How to apply:**
1. Decompose into `bot-row-actions.tsx` (~65 LOC), `bots-table.tsx` (~105 LOC), and refactored `bots-list-client.tsx` (~115 LOC).
2. Wire `POST /api/bots/[id]` with `{ action: 'pause' | 'resume' | 'start' }`, in-flight lock, `Loader2`, and reactive state update.
3. Sync i18n keys for `bots.columns.detail` and `bots.actions.*` across `en.json` and `vi.json`.
4. Split test suites so `bot-row-actions.test.tsx` and `bots-list-client.test.tsx` both remain <= 200 LOC.
