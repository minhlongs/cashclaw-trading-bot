---
name: tradebot-flaky-suite
description: cashclaw full suite is flaky-red ~30% on 2 pre-existing network-dependent test files (pipeline engine + integration, timeouts); 3 consecutive greens = protocol satisfied
metadata:
  type: project
---

The `npx vitest run` / `npm run quality:gate` suite in cashclaw-trading-bot fails intermittently (~1 in 3 runs as of 2026-08-24) on exactly two pre-existing files:
- `src/forest/alpha/pipeline/engine.test.ts` (timeouts at 10s)
- `src/forest/alpha/integration/pipeline-integration.test.ts` (real network fetch attempts → "fetch failed" 403/timeouts)

**Why:** These tests hit live Binance endpoints (`fetchDerivatives` warnings in logs) and are committed/unmodified since before Phase 3; they import nothing from new modules. Failure count fluctuates run-to-run (9 → 2 → 7 → 0), confirming environment flake, not regression.

**How to apply:** When gating a result that claims N/N pass ×3: run the suite up to 5 times; treat ≥3 consecutive fully-green runs as satisfying the flake protocol. Verify failing files are (a) unmodified (`git status --porcelain` empty) and (b) do not import the new modules before attributing flake to pre-existing causes — record both checks in the verdict. Related: [[tradebot-execution-log-misreport]].
