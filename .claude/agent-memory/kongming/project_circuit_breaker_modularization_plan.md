---
name: project-circuit-breaker-modularization-plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; circuit-breaker-types, circuit-breaker-state, circuit-breaker facade, <= 150 LOC budget, zero regression
metadata:
  type: project
---

Exchange circuit breaker modularization plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/tree/exchange/provider/circuit-breaker.ts` is 236 LOC, violating the repository's strict <= 200 LOC ceiling constraint (target <= 150 LOC).
**How to apply:** Guide decomposition into `circuit-breaker-types.ts` (~45 LOC), `circuit-breaker-state.ts` (~105 LOC), `circuit-breaker-state.test.ts` (~95 LOC), and thin `circuit-breaker.ts` facade (~90 LOC) maintaining strict 100% backward compatibility across all 4,113 tests and consumers.
