---
name: feedback-fix-defect-classes-not-instances
description: When a flaky/teardown-race bug is found, fix the whole defect class and verify under full-suite load N>=5 — per-instance fixes verified in isolation regress immediately.
metadata:
  type: feedback
---

Rule: for race/teardown/async-cleanup defects, enumerate every site sharing the pattern and fix the class. Verify with ≥5 consecutive **full-suite** runs checking the **exit code**, never a single file in isolation and never a single run.

**Why:** on trade-bot, Phase T fixed the flaky suite by patching two tests in `src/components/settings/strategy-settings.test.tsx` and recorded "Verified: 5/5 consecutive runs all green" (commit `66568b8`). Measured on 2026-08-15, the suite still exited non-zero in 2 of 8 full runs — because the real defect was a *class* (`setState` in a `finally` after `await`, no mounted-guard) present in 10 files, and a **different component loses the race each run**. Every file is green in isolation, so the isolated re-run that "confirmed" the fix could never have caught it. The test summary also said `Tests 1610 passed (1610)` on the red runs, so reading the pass count instead of `$?` hides it completely. See [[project-tradebot-golive-gap]].

**How to apply:** when told a flaky test is fixed, do not accept it. Grep for the pattern across the codebase to size the class, then run `for i in 1..5; do npx vitest run; echo $?; done` and read exit codes. Prefer the fix that removes the hazard in the component/production code (cleanup flag, AbortController, clearTimeout) over one that only re-times the test — the test-side fix leaves the production bug and the next test to touch that area re-opens the flake.
