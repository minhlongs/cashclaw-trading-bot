---
name: phase6-plan-written
description: Phase 6 plan written at .orchestrate/latest/plan.md — 4 steps (composition, portfolio, EXTREME cost, eval seam), 5 escrows explicitly deferred
metadata:
  type: project
---

Phase 6 plan (Alpha Composition + Portfolio Engine + Realistic Cost Model) written 2026-08-25.

**Why:** Phase 5 shipped GREEN (b3f51fc, 2619 tests); Phase 6 addresses Mission §6+§7+§8.

**How to apply:** Plan at `.orchestrate/latest/plan.md`. Four steps: A (composition scorer in tree), B (portfolio engine in tree), C (EXTREME cost mode), D (forest eval seam). Multi-pair scan, walk-forward, survival consumption explicitly deferred with re-open conditions. Key correction: task.md referenced `src/tree/alpha/relative-value/pairs.ts` but actual file is `src/tree/alpha/correlation/pairs.ts` — verified during plan scout. Stale bps comments (11/17/30 → 16/27/50) in forest cost-model.ts confirmed and included in Step C.
