---
name: falsification-campaign-complete
description: 24 hypothesis classes tested, all falsified. Scientific conclusion: no retail-scale alpha in OHLCV/funding/OI data for SOLUSDT. Next move is platform completion, not more R&D.
metadata:
  type: project
---

Falsification campaign completed 2026-08-18. 24 hypothesis classes tested across OHLCV, funding rate, OI, liquidation, Fear & Greed, cross-asset, and composite signals. All falsified or noise (10/162 OOS passes = 6%, aggregate PnL -$455k on the best candidate).

**Why:** The R&D phase needed to determine whether simple TA or derivative signals produce positive OOS expectancy on SOLUSDT at retail scale with conservative costs. Answer: no.

**How to apply:**
- Do NOT re-test hypotheses on existing data sources — it's p-hacking at this point
- The platform's value is paper-trading infrastructure + regime awareness, not alpha signals
- The regime engine (`src/tree/regime/`) is complete and should be wired into bot execution
- Order book microstructure (L2/L3) is the only genuinely untested class that could yield alpha, but requires new data infrastructure
- The definitive report is at `plans/reports/technical-strategy-falsification-2026-08-17.md`
- A standalone `docs/falsification-report.md` should be written as the project's key R&D deliverable
