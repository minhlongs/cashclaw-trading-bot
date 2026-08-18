# Cross-Asset Correlation — Walk-Forward Results

**Date:** 2026-08-18
**Assets:** BTCUSDT, ETHUSDT, SOLUSDT | **Interval:** 8h | **Days:** 730
**Pairs:** BTC/ETH, BTC/SOL, ETH/SOL
**Cost:** conservative
**Configs:** 36 per pair (4 entries × 3 exits × 3 holds)

---

## Cointegration Analysis

| Pair | Correlation | Half-Life | Coint P-value |
|---|---|---|---|

## Results Summary

| Status | Count |
|---|---|
| PASSED OOS | 0/108 |
| MARGINAL | 0/108 |
| FAILED | 108/108 |

## Top 10 by Test Sharpe

| Pair | zEntry | zExit | MaxHold | Train Trades | Train PnL | Train Sharpe | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BTC/ETH | 2 | 0 | 12 | 54 | $-12011 | -15.37 | 21 | $-4584 | -7.86 | $-269 | $-163 | ❌ |
| BTC/SOL | 1.5 | 0 | 12 | 70 | $-12542 | -12.45 | 45 | $-7383 | -8.00 | $-201 | $-124 | ❌ |
| BTC/SOL | 2.5 | 0 | 12 | 28 | $-7872 | -14.06 | 16 | $-3823 | -8.01 | $-300 | $-185 | ❌ |
| BTC/SOL | 2 | 0 | 12 | 43 | $-9313 | -11.71 | 28 | $-6005 | -8.23 | $-265 | $-163 | ❌ |
| ETH/SOL | 1.5 | 0 | 12 | 75 | $-13365 | -13.68 | 38 | $-6405 | -8.34 | $-209 | $-126 | ❌ |
| BTC/ETH | 2 | 0.3 | 12 | 54 | $-12105 | -17.11 | 22 | $-4769 | -8.48 | $-269 | $-166 | ❌ |
| BTC/SOL | 2 | 0.3 | 12 | 43 | $-9169 | -12.26 | 28 | $-5676 | -8.83 | $-251 | $-159 | ❌ |
| BTC/ETH | 2 | 0.5 | 12 | 54 | $-11372 | -20.05 | 22 | $-4559 | -8.87 | $-250 | $-160 | ❌ |
| ETH/SOL | 2 | 0 | 12 | 42 | $-9263 | -13.72 | 28 | $-5703 | -8.93 | $-245 | $-156 | ❌ |
| ETH/SOL | 2.5 | 0 | 12 | 25 | $-6763 | -14.22 | 14 | $-3706 | -9.03 | $-327 | $-210 | ❌ |

## Verdict

**0/108 PASSED.** Cross-asset correlation pairs trading does NOT produce positive expectancy after conservative costs.
