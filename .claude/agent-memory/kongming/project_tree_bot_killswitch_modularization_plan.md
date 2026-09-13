---
name: project-tree-bot-killswitch-modularization-plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; Tree bot killswitch modularization into evaluator and audit modules, <= 200 LOC budget
metadata:
  type: project
---

2026-09-14 plan written at `.orchestrate/latest/plan.md`. Tree bot killswitch modularization and LOC budget compliance.

**Why:** `src/tree/bot/killswitch.ts` (241 LOC) violates the project's strict $\le 200$ LOC budget ceiling (`CLAUDE.md`, `development-rules.md`). The file conflates risk evaluation arithmetic, cross-layer forest audit ledger I/O, and bot state lifecycle management.

**How to apply:** Extract pure risk calculation to `killswitch-evaluator.ts` (~65 LOC, ceiling $\le 90$ LOC) and unit tests to `killswitch-evaluator.test.ts` (~85 LOC, ceiling $\le 120$ LOC); isolate flight-recorder audit logging to `killswitch-audit.ts` (~35 LOC, ceiling $\le 50$ LOC); shrink `killswitch.ts` to ~140 LOC (ceiling $\le 160$ LOC); tighten `killswitch.test.ts` to $\le 200$ LOC; verify 4,062+ tests, TypeScript, ESLint, Knip; deploy to Cloudflare Workers edge runtime and smoke test.
