# Falsification Report: Alpha Discovery Campaign

**Date:** 2026-08-18
**Status:** FINAL
**Scope:** 24 hypothesis classes tested on SOLUSDT/ETHUSDT/BTCUSDT across 8h, 1d, and 1h timeframes

---

## Executive Summary

**No strategy class tested produced persistent out-of-sample positive expectancy.** Across 24 hypothesis classes, 162+ walk-forward OOS tests, and ~10,000 total OOS trades, every signal that appeared in-sample was either overfit, regime-specific, or below the noise floor after realistic costs.

This is a valid scientific negative result, not a failure. The market appears efficient at the data resolution (OHLCV + funding rate + open interest + liquidation + Fear & Greed Index) and execution scale (retail-tier latency, 17–27 bps round-trip costs) available to this system.

**Bottom line:** CashClaw's value is in its paper-trading *framework*, not in any discovered alpha signal. Do not surface any tested strategy to customers as "proven" or "profitable."

---

## Methodology

### Data sources
- **OHLCV:** Binance spot klines (SOLUSDT 8h: 6,596 candles, 2020-08-11 to 2026-08-18)
- **Funding rate:** Binance `fapi/v1/fundingRate` (6,494 periods, 2020-09-13 to now)
- **Open interest / liquidation:** Binance `fapi/v1/*` endpoints (offline injection only — live endpoints return 403 from this environment)
- **Sentiment:** Fear & Greed Index

### Cost model
Conservative stress config applied to every backtest: **fee 10 bps + slippage 7 bps + market impact 10 bps = 27 bps round-trip.** Gross PnL was never reported as the primary result.

### Out-of-sample criteria
A config "passes" OOS only if **all three** hold:
1. ≥ 5 OOS trades
2. Positive Sharpe on OOS window
3. Bootstrap CI lower bound > 0 (1000 resamples, block length proportional to window size)

### Walk-forward design
6 rolling windows (548-day train / 182-day test / 182-day step) spanning 2020–2024. This covers bull market, bear market / FTX collapse, recovery, and pre-halving regimes. A single 65/35 train/test split is insufficient to distinguish signal from regime-luck — multi-window walk-forward is the decisive test.

---

## Results by Signal Class

| Signal Class | Hypothesis Classes | OOS Result | Verdict |
|---|---|---|---|
| TA trend / momentum / breakout | 12 classes | 14/15 negative | FALSIFIED |
| TA mean reversion (RSI, BB, z-score) | 4 classes | 0/24 to 4/48 noise | FALSIFIED |
| Funding rate (fade, follow, arb, basis) | 4 classes | 0/7 OOS pass | FALSIFIED |
| ML regime detection | 1 class | Majority-class collapse | FALSIFIED |
| Cross-asset correlation / pairs | 2 classes | 108/108 negative | FALSIFIED |
| Sentiment (Fear & Greed) | 1 class | 0/27 OOS pass | FALSIFIED |
| Composites (sentiment+funding, vol-of-vol) | 2 classes | 0/27, 2/48 noise | FALSIFIED |
| Session / volume / wick geometry | 3 classes | 0/24 to 4/48 noise | FALSIFIED |
| **Funding × price extreme interaction** | 1 class | **10/162 (6%), -$455,090** | **FALSIFIED** |

### The one that almost worked

**Funding × Price Extreme Interaction** was the only class showing any OOS signal: 12/27 pass on SOL pinned to 2025-09-19. Walk-forward validation revealed the truth:

| Window | Period | OOS Pass | Aggregate PnL |
|---|---|---|---|
| 1 | Apr–Oct 2022 | 9/27 | +$19,743 |
| 2 | Oct 2022–Apr 2023 | 0/27 | -$107,393 |
| 3 | Apr–Oct 2023 | 1/27 | -$27,693 |
| 4 | Oct 2023–Apr 2024 | 0/27 | -$144,360 |
| 5 | Apr–Oct 2024 | 0/27 | -$39,056 |
| 6 | Oct 2024–Apr 2025 | 0/27 | -$136,331 |
| **Total** | | **10/162 (6%)** | **-$455,090** |

No config passed in more than 1 of 6 windows. The signal was regime-locked to the mid-2022 bear market — pure overfitting to a single regime, not a reproducible edge. The 12/27 on SOL 2025-09-19 was an artifact of that regime leaking into the test window, not genuine alpha.

**Lesson:** A single train/test split can produce compelling-looking results that vanish under walk-forward. Multi-window validation is mandatory before any "candidate" classification.

---

## What Would Be Needed for the Next Tier

The 24 classes tested exhaust the signal space derivable from OHLCV + funding + OI + liquidation + sentiment at retail data resolution. Genuinely untested alpha requires **fundamentally different data infrastructure**:

| Untested Class | Data Required | Infrastructure Gap |
|---|---|---|
| Order book microstructure | L2/L3 depth snapshots | WebSocket depth stream + storage pipeline |
| On-chain smart money | Blockchain explorer APIs, DEX subgraphs | Entirely new data pipeline |
| Fundamental catalysts | Unlocks, upgrades, governance events | Structured data source + NLP pipeline |
| CEX internal flow | Large block trades, OTC desk flow | Premium exchange feeds (not retail-tier) |

Cross-venue latency arbitrage is excluded outright — it requires co-located feeds that are not retail-feasible.

---

## Implications for Platform Design

1. **Do not present any tested strategy as "alpha" or "proven."** Every one is falsified. The platform's value is the paper-trading framework, regime awareness, and risk management — not signal generation.
2. **Position honestly:** "We tested 24 strategy classes so you don't have to" is a stronger, more trustworthy message than "automated trading bot."
3. **Regime engine still has value** even without alpha signals: bot execution awareness (avoid SHOCK regime), risk management (regime-adjusted position sizing), and dashboard context.
4. **Future alpha research is gated on new data infrastructure**, not more hypothesis sweeps on existing data.

---

## Reproducibility

Every backtest script is standalone and reproducible:
- `src/forest/backtest/*.ts` — individual hypothesis sweeps
- `src/forest/backtest/funding-price-extreme-walkforward.ts` — the 6-window walk-forward that falsified the last candidate
- All scripts pin end-dates for reproducibility and use the conservative cost model
- Full results in `plans/reports/technical-strategy-falsification-2026-08-17.md`

---

*This report is the key R&D deliverable of the alpha discovery campaign. It prevents future re-testing of dead hypotheses and informs platform design decisions.*