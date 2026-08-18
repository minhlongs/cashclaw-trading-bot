# Out-of-Sample Validation — Funding-Rate Fade

**Date:** 2026-08-18
**Train:** 2023-09-20 → 2025-01-07 (475 days)
**Test:**  2025-01-07 → 2025-09-19 (256 days)
**Cost Model:** conservative

---

## Results

| Config | Train Trades | Train PnL | Train Sharpe | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | Degradation | OOS |
|---|---|---|---|---|---|---|---|---|---|---|
| SOL: thresh=0.0001 maxHold=24 | 52 | $-13659 | -1.50 | 27 | $-6862 | -1.22 | $-599 | $102 | N/A% | ❌ |
| SOL: thresh=0.0001 maxHold=12 | 92 | $-15462 | -1.97 | 45 | $-4523 | -0.79 | $-320 | $114 | N/A% | ❌ |
| SOL: thresh=0.0001 maxHold=6 | 162 | $-19522 | -2.27 | 69 | $-7122 | -1.65 | $-207 | $7 | N/A% | ❌ |
| SOL: thresh=0.0003 maxHold=12 | 28 | $-4336 | -0.84 | 4 | $-2620 | -3.07 | $-958 | $-288 | N/A% | ❌ |
| ETH: thresh=0.0003 maxHold=12 | 18 | $-134 | -0.05 | 0 | $0 | 0.00 | $0 | $0 | N/A% | ❌ |
| ETH: thresh=0.0001 maxHold=12 | 89 | $-6857 | -1.17 | 31 | $-7153 | -1.50 | $-510 | $7 | N/A% | ❌ |
| ETH: thresh=0.0001 maxHold=6 | 157 | $-9056 | -1.79 | 45 | $-5474 | -1.42 | $-255 | $14 | N/A% | ❌ |

## Verdict

**PASSED OOS:** 0/7 configurations
**MARGINAL:** 0/7 (positive PnL but CI crosses zero)
**FAILED:** 7/7

**No configuration passed out-of-sample validation.** The in-sample results may be overfit.
