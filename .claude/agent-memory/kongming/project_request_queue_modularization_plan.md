---
name: project-request-queue-modularization-plan
description: 2026-09-15 plan at .orchestrate/latest/plan.md; request-queue-pool, request-queue-drain, request-queue facade, <= 150 LOC budget, zero regression
metadata:
  type: project
---

Request queue modularization plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/tree/exchange/queue/request-queue.ts` is 218 LOC, violating the repository's strict <= 200 LOC ceiling constraint (target <= 150 LOC).
**How to apply:** Guide decomposition into `request-queue-pool.ts` (~85 LOC), `request-queue-drain.ts` (~70 LOC), and thin `request-queue.ts` facade (~90 LOC) maintaining strict 100% backward compatibility across all 4,122 tests and consumers.
