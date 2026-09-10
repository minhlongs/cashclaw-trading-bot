---
name: project-vibe-integration-phase1
description: Vibe-Trading × CashClaw integration — Phase 0 recon done (2 docs untracked), Phase 1 Research Contracts planned at .orchestrate/latest/plan.md; migration deferred to Phase 2
metadata:
  type: project
---

**Fact:** Vibe-Trading × CashClaw integration started 2026-08-26. Phase 0 (recon) COMPLETE but its two docs (`docs/vibe-trading-integration-map.md`, `docs/vibe-trading-security-boundary.md`) were still UNTRACKED in git as of planning time — first commit of Phase 1 branch must include them. Full 32-point spec at `.orchestrate/latest/task.md`.

Phase 1 (Research Contracts) plan written at `.orchestrate/latest/plan.md`: new `src/tree/research/` module — hypothesis/goals/evidence/provenance/experiment-spec + deterministic AlphaCompiler. Key decisions:
- **Migration 0012 DEFERRED to Phase 2** — 0009 `research_hypotheses` (parent_id/mutation/status/evidence_json) + 0010 queue tables suffice until AlphaZooAdapter needs persistence.
- Mechanism gate = deterministic heuristic floor (length ≥40 + blocklist regex + causal-connective/domain-token rule), NOT semantic judgment.
- Compiler is pure tree-layer: dataWindow + feature allowlist passed via ctx param; reuses `declareFeature()` (src/tree/alpha/indicator-types.ts:107), `resolveStressConfig`, `Universe` type.

**Why:** spec §1 forbids duplicating existing abstractions; §8 forbids eval/exec/shell; tree layer must stay pure (no I/O except crypto.subtle).

**How to apply:** when Phase 2 planning comes, check whether Phase 1 actually shipped (look for src/tree/research/), whether migration decision flipped, and reuse the roadmap stubs (Phases 2–7) in plan.md rather than re-deriving. Phases 3–7 each get their own plan run. Related: [[project-tradebot-golive-gap]], [[project-phase5-relative-value]].
