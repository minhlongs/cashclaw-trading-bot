---
name: project-bot-instance-modularization-plan
description: Cycle 21 plan to modularize src/tree/bot/bot-instance.ts into bot-instance-lifecycle.ts (<= 150 LOC) & Cloudflare Go-Live
metadata:
  type: project
---

Cycle 21 plan written for modularizing `src/tree/bot/bot-instance.ts` (197 LOC) into `bot-instance-lifecycle.ts` (~80 LOC) + `bot-instance.ts` (~125 LOC facade).

**Why:** Satisfy repo-wide file size target <= 150 LOC (hard ceiling <= 200 LOC) without breaking bot lifecycle state machine, order routing, or timer ticks.
**How to apply:** Preserves `BotInstance` public API, 0 `:any` types, 0 new `eslint-disable`, 4,126+ green tests, and Cloudflare Workers deploy doctrine.
