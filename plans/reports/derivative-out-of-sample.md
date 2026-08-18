# Out-of-Sample Validation — Funding-Rate Fade

**Date:** 2026-08-18
**Train:** 2024-08-18 → 2025-12-05 (475 days)
**Test:**  2025-12-05 → 2026-08-18 (256 days)
**Cost Model:** conservative

---

## Results

| Config | Train Trades | Train PnL | Train Sharpe | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | Degradation | OOS |
|---|---|---|---|---|---|---|---|---|---|---|
| SOL: thresh=0.0001 maxHold=24 | 50 | $-6339 | -0.78 | 25 | $-3688 | -1.00 | $-384 | $83 | N/A% | ❌ |
| SOL: thresh=0.0001 maxHold=12 | 82 | $-8304 | -1.13 | 44 | $-1229 | -0.29 | $-187 | $136 | N/A% | ❌ |
| SOL: thresh=0.0001 maxHold=6 | 130 | $-11176 | -1.84 | 68 | $-2254 | -0.54 | $-133 | $66 | N/A% | ❌ |
| SOL: thresh=0.0003 maxHold=12 | 10 | $-256 | -0.12 | 5 | $37 | 0.02 | $-633 | $572 | N/A% | ⚠️ |
| ETH: thresh=0.0003 maxHold=12 | 5 | $384 | 0.27 | 1 | $754 | 0.00 | $754 | $754 | 100%% | ⚠️ |
| ETH: thresh=0.0001 maxHold=12 | 63 | $-8292 | -1.27 | 27 | $4155 | 1.28 | $-37 | $376 | N/A% | ⚠️ |
| ETH: thresh=0.0001 maxHold=6 | 98 | $-6688 | -1.27 | 32 | $3300 | 1.51 | $-5 | $221 | N/A% | ⚠️ |

## Verdict

**PASSED OOS:** 0/7 configurations
**MARGINAL:** 2/7 (positive PnL but CI crosses zero)
**FAILED:** 5/7

**No configuration passed out-of-sample validation.** The in-sample results may be overfit.
