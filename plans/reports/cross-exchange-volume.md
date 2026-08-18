# Cross-Exchange Volume Divergence — Walk-Forward Results

**Date:** 2026-08-18
**Pair:** SOLUSDT | **Interval:** 8h | **Days:** 730
**End date:** 2025-09-19
**Exchanges:** Binance, simulated secondary
**Cost:** conservative
**Configs:** 36 (3 windows x 2 longThresh x 2 shortThresh x 3 maxHold)

---

## Strategy

Compare rolling volume between Binance and a simulated secondary exchange for SOLUSDT.
Volume ratio = BinanceVol(window) / OKXVol(window).
LONG when ratio > longThreshold (Binance dominating); SHORT when ratio < shortThreshold (OKX dominating).
Exit when ratio reverts to neutral zone or maxHold bars reached.

## Volume Ratio Stats

| Metric | Value |
|---|---|
| Mean (window=24) | 2.2845 |
| Std | 0.3084 |
| Min | 1.5188 |
| Max | 3.2915 |

## Full Period Results (Top 10 by PnL)

| Window | LongThresh | ShortThresh | MaxHold | Train Trades | Train PnL | Train Sharpe | Win Rate |
|---|---|---|---|---|---|---|---|
| 6 | 1.5 | 0.5 | 6 | 111 | $4569 | 0.74 | 53.2% |
| 6 | 1.5 | 0.67 | 6 | 111 | $4569 | 0.74 | 53.2% |
| 6 | 1.2 | 0.5 | 12 | 60 | $3987 | 0.52 | 45.0% |
| 6 | 1.2 | 0.67 | 12 | 60 | $3987 | 0.52 | 45.0% |
| 24 | 1.2 | 0.5 | 12 | 58 | $3272 | 0.53 | 48.3% |
| 24 | 1.2 | 0.67 | 12 | 58 | $3272 | 0.53 | 48.3% |
| 24 | 1.5 | 0.5 | 12 | 58 | $3272 | 0.53 | 48.3% |
| 24 | 1.5 | 0.67 | 12 | 58 | $3272 | 0.53 | 48.3% |
| 6 | 1.2 | 0.5 | 24 | 31 | $2849 | 0.42 | 61.3% |
| 6 | 1.2 | 0.67 | 24 | 31 | $2849 | 0.42 | 61.3% |

## OOS Results (All 36 Configs)

| Window | LongThresh | ShortThresh | MaxHold | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 1.2 | 0.5 | 6 | 60 | $4511 | 1.09 | $-49 | $224 | FAIL |
| 6 | 1.2 | 0.5 | 12 | 32 | $3070 | 0.79 | $-142 | $337 | FAIL |
| 6 | 1.2 | 0.5 | 24 | 17 | $5461 | 1.27 | $-169 | $863 | FAIL |
| 6 | 1.2 | 0.67 | 6 | 60 | $4511 | 1.09 | $-50 | $212 | FAIL |
| 6 | 1.2 | 0.67 | 12 | 32 | $3070 | 0.79 | $-143 | $324 | FAIL |
| 6 | 1.2 | 0.67 | 24 | 17 | $5461 | 1.27 | $-127 | $835 | FAIL |
| 6 | 1.5 | 0.5 | 6 | 60 | $3806 | 1.05 | $-53 | $188 | FAIL |
| 6 | 1.5 | 0.5 | 12 | 34 | $5482 | 1.24 | $-82 | $410 | FAIL |
| 6 | 1.5 | 0.5 | 24 | 22 | $6218 | 1.36 | $-99 | $707 | FAIL |
| 6 | 1.5 | 0.67 | 6 | 60 | $3806 | 1.05 | $-54 | $186 | FAIL |
| 6 | 1.5 | 0.67 | 12 | 34 | $5482 | 1.24 | $-111 | $427 | FAIL |
| 6 | 1.5 | 0.67 | 24 | 22 | $6218 | 1.36 | $-114 | $717 | FAIL |
| 12 | 1.2 | 0.5 | 6 | 60 | $5124 | 1.25 | $-51 | $222 | FAIL |
| 12 | 1.2 | 0.5 | 12 | 32 | $3683 | 1.04 | $-120 | $342 | FAIL |
| 12 | 1.2 | 0.5 | 24 | 17 | $5354 | 1.48 | $-89 | $695 | FAIL |
| 12 | 1.2 | 0.67 | 6 | 60 | $5124 | 1.25 | $-52 | $225 | FAIL |
| 12 | 1.2 | 0.67 | 12 | 32 | $3683 | 1.04 | $-84 | $331 | FAIL |
| 12 | 1.2 | 0.67 | 24 | 17 | $5354 | 1.48 | $-89 | $742 | FAIL |
| 12 | 1.5 | 0.5 | 6 | 60 | $3574 | 0.99 | $-50 | $193 | FAIL |
| 12 | 1.5 | 0.5 | 12 | 34 | $5111 | 1.32 | $-82 | $376 | FAIL |
| 12 | 1.5 | 0.5 | 24 | 18 | $5434 | 1.40 | $-95 | $743 | FAIL |
| 12 | 1.5 | 0.67 | 6 | 60 | $3574 | 0.99 | $-58 | $180 | FAIL |
| 12 | 1.5 | 0.67 | 12 | 34 | $5111 | 1.32 | $-76 | $358 | FAIL |
| 12 | 1.5 | 0.67 | 24 | 18 | $5434 | 1.40 | $-96 | $754 | FAIL |
| 24 | 1.2 | 0.5 | 6 | 59 | $2540 | 0.66 | $-78 | $179 | FAIL |
| 24 | 1.2 | 0.5 | 12 | 32 | $4701 | 1.43 | $-56 | $363 | FAIL |
| 24 | 1.2 | 0.5 | 24 | 17 | $5940 | 1.37 | $-154 | $873 | FAIL |
| 24 | 1.2 | 0.67 | 6 | 59 | $2540 | 0.66 | $-81 | $169 | FAIL |
| 24 | 1.2 | 0.67 | 12 | 32 | $4701 | 1.43 | $-40 | $336 | FAIL |
| 24 | 1.2 | 0.67 | 24 | 17 | $5940 | 1.37 | $-146 | $875 | FAIL |
| 24 | 1.5 | 0.5 | 6 | 59 | $2540 | 0.66 | $-86 | $176 | FAIL |
| 24 | 1.5 | 0.5 | 12 | 32 | $4701 | 1.43 | $-55 | $344 | FAIL |
| 24 | 1.5 | 0.5 | 24 | 17 | $5940 | 1.37 | $-173 | $839 | FAIL |
| 24 | 1.5 | 0.67 | 6 | 59 | $2540 | 0.66 | $-89 | $168 | FAIL |
| 24 | 1.5 | 0.67 | 12 | 32 | $4701 | 1.43 | $-50 | $357 | FAIL |
| 24 | 1.5 | 0.67 | 24 | 17 | $5940 | 1.37 | $-161 | $833 | FAIL |

## Verdict

**0/36 configs PASSED.** Cross-exchange volume divergence does NOT produce robust alpha after conservative costs.
