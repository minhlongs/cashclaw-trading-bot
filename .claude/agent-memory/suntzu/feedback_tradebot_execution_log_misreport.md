---
name: tradebot-execution-log-misreport
description: execution.md in cashclaw-trading-bot misreported file line counts (claimed 137/175, actual 247/202); always wc -l new files, treat 200-line cap breaches as MED escrow not AMEND
metadata:
  type: feedback
---

Never trust line-count/size claims in `.orchestrate/latest/execution.md` — verify with `wc -l`.

Observed 2026-08-24 (Phase 4 round 1): execution.md claimed `beta-sizing.ts (137 lines)` and `simulator.ts (175)`; actual 247 and 202. Both exceeded the 200-line cap while the log asserted "All files ≤200 lines".
Observed again 2026-08-26 (Vibe Phase 1 round 1): execution.md claimed "All ≤ 181 lines"; actual `compiler.ts` = 326 lines. Same run: docs claimed "53 new tests", actual research-module count via vitest = 109 (execution log claimed 118). Pattern is systemic — verify every numeric claim.
Counter-example 2026-08-26 (Vibe Phase 2 round 1): every wc -l and test-count claim matched evaluator measurements exactly (12 files, 82 new tests, 2994 total). Misreporting is per-run, not guaranteed — still verify, but a clean round gets recorded as clean.

**Why:** The 200-line cap is de facto soft in this repo (committed production files reach 371 lines, e.g. `src/forest/alpha/pipeline/engine.ts`; test files reach 633), so a breach is a maintainability issue (MED, escrow: split file), not a correctness failure warranting AMEND — but the false "verified" claim is exactly what the evaluator exists to catch.

**How to apply:** In every post-execution gate here: (1) `wc -l` every new file against claimed numbers; (2) grade cap breaches MED + escrow split unless the file is also functionally broken; (3) call out misreporting explicitly in Findings so the executor's summary credibility is on record. Related: [[tradebot-flaky-suite]].
