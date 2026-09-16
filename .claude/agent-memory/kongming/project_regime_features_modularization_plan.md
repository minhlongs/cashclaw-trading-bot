---
name: project-regime-features-modularization-plan
description: Plan to modularize src/tree/regime/features.ts from 201 LOC to feature-helpers.ts and features.ts <= 150 LOC
metadata:
  type: project
---

Modularization plan created for `src/tree/regime/features.ts` (201 LOC) to satisfy <= 200 LOC ceiling (Cycle 6 of LOC sweep).
Plan written to `.orchestrate/latest/plan.md`.

**Why:**
`src/tree/regime/features.ts` is 201 lines, exceeding the 200 LOC limit.

**How to apply:**
Extract 7 pure math/statistical helpers (`logReturns`, `stdDev`, `mean`, `trueRanges`, `linearSlope`, `zScore`, `adxLike`) to `src/tree/regime/feature-helpers.ts` (~135 LOC), leaving `features.ts` as orchestrator (~65 LOC), both well below the 150 LOC target.
