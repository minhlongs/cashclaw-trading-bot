---
name: project-alpha-pipeline-modularization-plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; pipeline-utils, pipeline-signals, pipeline-evaluation, engine facade, <= 200 LOC budget, zero regression
metadata:
  type: project
---

Alpha research pipeline engine modularization plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/forest/alpha/pipeline/engine.ts` has 452 LOC, exceeding the repo <= 200 LOC ceiling.
**How to apply:** Guide decomposition into `pipeline-utils.ts` (~110 LOC), `pipeline-signals.ts` (~140 LOC), `pipeline-evaluation.ts` (~140 LOC), and thin `engine.ts` facade (~100 LOC) with zero regression across 4,072 tests.
