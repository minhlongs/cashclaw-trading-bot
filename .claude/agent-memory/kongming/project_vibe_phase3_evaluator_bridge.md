---
name: vibe-phase3-evaluator-bridge
description: 2026-08-26 Phase 3 plan at .orchestrate/latest/plan.md — operator evaluator + IC/IR + falsification bridge; key finding only 2/4 registered seeds evaluable (no ts_sum in frozen vocabulary)
metadata:
  type: project
---

CashClaw × Vibe-Trading Phase 3 planned (plan written to `.orchestrate/latest/plan.md`, overwrites Phase 2 plan).

**Why:** After Phase 2, registered zoo alphas have no evaluator and no falsification verdict; spec §10 IC/IR missing entirely.

**How to apply:** Key binding facts for any future session touching this work:
- Only alpha101_006 (`-1 * ts_corr(open, volume, 10)`) and qlib158_beta5 (subscript-lag `(close_t - close_{{t-5}}) / (5 close)`) are evaluable; vsump5/vsump10 carry `\sum` residue — no `ts_sum` in the frozen 17-op vocabulary → NOT_EVALUABLE bucket, never silently FALSIFIED.
- Verdicts: ALIVE_FOR_FURTHER_RESEARCH | FALSIFIED | NOT_EVALUABLE via bootstrapCi + permutationTest + assessWalkForwardConsistency shim (6 IC chunks as total_pnl, degradationRatio=1 neutral).
- No migration 0012; queue enqueue deferred to Phase 4 (QueueJobSpec would force fabricated fields).
- Forward-return boundary: buildForwardReturnSeries only in src/tree/alpha/factors/panel.ts; grep gate bans "forward" in zoo operator files.
- Seed run data: .cache/ohlcv BTC/ETH/SOL 1d, 730 aligned bars 2024-08-19→2026-08-18.
Related: [[project_vibe_phase2_zoo_adapter]], [[project_vibe_integration_phase1]].
