---
name: pairs-family-plan-written
description: 2026-08-26 plan for pairs/RV as alpha family — causal pair selection + walk-forward driver + 4-arm config-variant comparison through ONE engine; verdict SURVIVED/KILLED is the deliverable
metadata:
  type: project
---

Pairs/Relative-Value-as-alpha-family plan written 2026-08-26 to `.orchestrate/latest/plan.md` (task from user verbatim in task.md). External methodology audited live from github.com/nutdnuy/pairs-trading-research-skill (README + references/methodology.md) — Engle-Granger, BH-FDR, OU half-life, rolling z machine, formation/holdout split; NO PCA/DBSCAN needed at n=8 universe.

**Why:** Phase 5 engine exists (runPairSpreadSim, strictly-before-t β, fail-closed gate); the gap is everything AROUND it: selection-inside-training-window (new pair-selection.ts), stability scoring, RV walk-forward driver (generic runWalkForward is candle/BacktestResult-shaped and unusable directly → shim adapter instead), regime entry filter, round-trip metrics, ablation/robustness, real-data verdict. Falsification history says KILLED is the likely honest outcome and an acceptable ship.

**How to apply:** Load-bearing calls if reviewing execution: (1) 4 methods = config variants through ONE simulator (hedgeMode frozen/rolling, inSimTradabilityGate toggle default TRUE, pure entryFilter callback); primary arm pre-registered = M4 regime-aware. (2) Export computeSlices additively from forest/backtest/walkforward.ts rather than reimplementing slicing. (3) Funding = documented N/A (fapi 403 backlog). (4) Verdict script scripts/rv-pairs-verdict.ts manual-only, never vitest-imported (flaky-network escrow). (5) First commit must be docs/PAIRS_RESEARCH_INTEGRATION.md with frozen protocol BEFORE any real run. Related: [[project_phase5_relative_value]], [[project_phase6_plan_written]].
