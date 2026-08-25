---
name: phase5-relative-value-planned
description: Alpha Research OS Phase 5 (relative-value pair harness) planned 2026-08-24 — plan at .orchestrate/latest/plan.md, key causal/fail-closed design calls
metadata:
  type: project
---

Phase 5 (relative-value research) fully planned 2026-08-24; deliverable `.orchestrate/latest/plan.md` follows the Phase 4 PASS-gated format. Implementation not yet started.

**Why:** Mission §4 requires "do not assume any pair is tradable" — plan centers on a fail-closed validation gate BEFORE any trade, reusing `src/tree/alpha/correlation/` primitives inside new causal wrappers (`estimateRollingHedgeRatio`, `validatePairTradable`) rather than rebuilding them.

**How to apply:** If consulted on Phase 5 implementation review, hold these load-bearing calls: (1) hedge ratio/z-score strictly-before-t, decision at t earns t→t+1; (2) β≤0 or |β|<eps → null → FLAT, never silent hedge=1; (3) `generatePairSignals` banned from the causal loop (full-array lookback = look-ahead); (4) forest barrel must be added to knip.json ignoreFiles (precedent: cross-sectional-eval); (5) beta neutrality = diagnostic only, sizing deferred to Phase 6. Related: [[project-tradebot-golive-gap]]
