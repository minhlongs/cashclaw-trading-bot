# Cross-Exchange Volume Divergence — Walk-Forward Results

**Date:** 2026-08-18
**Pair:** SOLUSDT | **Interval:** 8h | **Days:** 730
**End date:** 2025-09-19
**Exchanges:** Binance, Bybit
**Cost:** conservative
**Configs:** 36 (3 windows x 2 longThresh x 2 shortThresh x 3 maxHold)

---

## Strategy

Compare rolling volume between Binance and Bybit for SOLUSDT.
Volume ratio = BinanceVol(window) / BybitVol(window).
LONG when ratio > longThreshold (Binance dominating); SHORT when ratio < shortThreshold (Bybit dominating).
Exit when ratio reverts to neutral zone or maxHold bars reached.

## Volume Ratio Stats

| Metric | Value |
|---|---|
| Mean (window=24) | NaN |
| Std | NaN |
| Min | Infinity |
| Max | -Infinity |

## Full Period Results (Top 10 by PnL)

| Window | LongThresh | ShortThresh | MaxHold | Train Trades | Train PnL | Train Sharpe | Win Rate |
|---|---|---|---|---|---|---|---|
| 6 | 1.2 | 0.5 | 6 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.2 | 0.5 | 12 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.2 | 0.5 | 24 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.2 | 0.67 | 6 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.2 | 0.67 | 12 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.2 | 0.67 | 24 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.5 | 0.5 | 6 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.5 | 0.5 | 12 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.5 | 0.5 | 24 | 0 | $0 | 0.00 | 0.0% |
| 6 | 1.5 | 0.67 | 6 | 0 | $0 | 0.00 | 0.0% |

## OOS Results (All 36 Configs)

| Window | LongThresh | ShortThresh | MaxHold | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 1.2 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.2 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.2 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.2 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.2 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.2 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 6 | 1.5 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.2 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 12 | 1.5 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.2 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.5 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.5 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.5 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.67 | 6 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.67 | 12 | 0 | $0 | 0.00 | $0 | $0 | FAIL |
| 24 | 1.5 | 0.67 | 24 | 0 | $0 | 0.00 | $0 | $0 | FAIL |

## Verdict

**0/36 configs PASSED.** Cross-exchange volume divergence does NOT produce robust alpha after conservative costs.
