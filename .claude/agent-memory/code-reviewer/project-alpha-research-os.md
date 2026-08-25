---
name: project-alpha-research-os
description: CashClaw Alpha Research OS phases 1-2 context, layering rules, and known gaps found during Phase 2 review (2026-08-24)
metadata:
  type: project
---

Alpha Research OS = research-side falsification pipeline (paper/backtest only, mission §0 safety). Phase 1: tree-layer registry + lineage (`src/tree/alpha/registry`, migrations 0009). Phase 2 (branch `feat/alpha-research-os-phase2`): queue `src/tree/alpha/queue`, multiple-testing defense `src/forest/alpha/multiple-testing`, D1 store migration 0010. 2307 tests total after Phase 2 (184 of them new Phase 2 — docs claiming "200" are off).

**Why:** Mission requires fail-closed falsification (ANY failed check → falsified), append-only persistence, deterministic seeded stats, tree↝forest layering (tree must not import forest; forest→tree allowed).

**How to apply:** When reviewing future phases (orchestration wiring, promotion gate integration): (1) `research_queue_jobs.status` is frozen at insert-time — no fold-over-events reader exists yet, wiring must not trust `listJobs()` statuses; (2) `pboProxy` IS-mean includes the final OOS window (lenient bias); (3) `parameterSensitivity` is NOT part of `evaluateSurvival` despite docs saying all seven safeguards compose; (4) `enqueue` allows config duplicates once prior job is ARCHIVED — re-test prevention relies entirely on registry text-match in `validateJobSpec`; (5) 'survived' trigger is convention-bound, not evidence-bound to `SurvivalVerdict`.
