---
name: project-vibe-phase2-zoo-adapter
description: 2026-08-26 Phase 2 AlphaZooAdapter planned at .orchestrate/latest/plan.md — canonical duplicate key (raw formula string unusable), 7-bucket report, no migration 0012, escrow items folded
metadata:
  type: project
---

CashClaw × Vibe-Trading **Phase 2 — Alpha Zoo Adapter** planned 2026-08-26 at `.orchestrate/latest/plan.md` (base `main` @ `a20d234`, Phase 1 merged PR #9).

Key decisions (verified by recon, load-bearing):
- **Raw `formula_latex` is an UNUSABLE duplicate key**: 38 gtja191 formulas are literal `'see body'`; qlib158 window variants (`vsump5..60`) share identical text — window lives only in `min_warmup_bars`/`decay_horizon`. Duplicate detection = hash of canonical payload `{normalizedFormula, warmupBars, horizon, timeframe}` via Phase 1 `computeFormulaHash`.
- Report = 7 buckets (validation-error/unsupported/non-causal/duplicate/rejected/adapted/imported), Σ ≡ N invariant test-enforced; precedence order fixed in plan D3.
- Operators CLASSIFIED not implemented (17 supported from base.py + alias table); SUM/LOG/conditionals → UNSUPPORTED with reason = REIMPLEMENT backlog input.
- Migration 0012: NO (no runtime writer; seeds are version-controlled JSON static imports via resolveJsonModule).
- Escrow Phase 1 items 1–4 fold into first two commits (compiler split ≤200 via compile-stages.ts, dead `deriveSeedFromSpecId('')` removal changes specId VALUES but nothing persists specs — determinism test pins equality not hex; "53"→"109" count fix verified real count = 109).
- Seed slice ~12 entries incl. regression pair vsump5+vsump10 (must BOTH register) + one per outcome bucket; golden test pins per-entry outcomes as audit artifact.
**Why:** spec §6 requires fail-closed classification pipeline; zoo data enters as JSON manifests only, Python never executed/vendored.
**How to apply:** when Phase 2 executes, follow plan steps 0–7 in order; Phases 3–7 stubs unchanged. See [[project-vibe-integration-phase1]] for contracts context. Related: [[project-tradebot-golive-gap]].
