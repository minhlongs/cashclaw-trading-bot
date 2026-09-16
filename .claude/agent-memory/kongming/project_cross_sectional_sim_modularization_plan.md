---
name: cross-sectional-sim-modularization-plan
description: 2026-09-16 plan to split simulator.ts (199 LOC) into sim-helpers.ts + slim simulator.ts
metadata:
  type: project
---

Plan at `.orchestrate/latest/plan.md` (2026-09-16): modularize `src/tree/alpha/cross-sectional/simulator.ts` (199 LOC, at hard ceiling) by extracting 5 private helpers (`indexReturnPanel`, `validateSnapshotAlignment`, `computePeriodReturn`, `computeExposures`, `processPeriod`) into new `sim-helpers.ts` (~118 LOC), leaving `runCrossSectionalSim` as public orchestrator in slimmed `simulator.ts` (~70 LOC).

**Why:** File at 199 LOC hard ceiling; repo convention is ≤ 200 LOC per file with modular decomposition.

**How to apply:** Helpers are internal-only — do NOT add to `index.ts` barrel export (keeps Knip clean, public API unchanged). No test file changes. No new eslint-disable. Verbatim copy of logic, no refactoring. See [[project_regime_features_modularization_plan]] for similar pattern.
