---
name: project-alpha-derivative-funding-modularization-plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; funding-types, funding-api, funding-features, funding facade, <= 200 LOC budget, zero regression
metadata:
  type: project
---

Alpha derivative funding & signals modularization plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/tree/alpha/signals/funding.ts` has 280 LOC, violating the repository's strict <= 200 LOC ceiling constraint.
**How to apply:** Guide decomposition into `funding-types.ts` (~45 LOC), `funding-api.ts` (~115 LOC), `funding-features.ts` (~130 LOC), and thin `funding.ts` facade (~35 LOC) maintaining strict 100% backward compatibility across 57 tests in `funding.test.ts` and 4,108+ repo tests.
