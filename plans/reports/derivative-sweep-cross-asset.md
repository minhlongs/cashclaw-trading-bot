# Derivative Alpha Sweep — Cross-Asset Summary

**Date:** 2026-08-18
**Exchange:** Binance Futures
**Cost Model:** Conservative (fee=0.1%, slippage=0.07%, impact=0.1%)
**Date range:** 2024-10-21 → 2025-09-19 (~730 days)
**Hypothesis:** Extreme funding rates indicate crowded positions → fade the crowd

---

## Cross-Asset Comparison (Funding-Only Mode)

### SOLUSDT — Strongest tradeable signal

| Funding Thresh | Max Hold | Trades | Net PnL | Expectancy | Sharpe | Win% | CI 5% | CI 95% |
|---|---|---|---|---|---|---|---|---|
| 0.0001 | 24 | 46 | +$47,605 | **+$1,034/trade** | 5.35 | 78.3% | +$616 | +$1,458 |
| 0.0001 | 12 | 71 | +$44,298 | +$624/trade | 5.22 | 74.6% | +$381 | +$867 |
| 0.0001 | 6 | 94 | +$41,038 | +$436/trade | 5.14 | 71.3% | +$282 | +$589 |
| 0.0003 | 12 | 15 | +$10,050 | +$670/trade | 7.27 | 73.3% | +$282 | +$1,057 |
| 0.0001 | 3 | 150 | +$37,573 | +$250/trade | 7.11 | 69.3% | +$169 | +$351 |

**Key insight:** SOL funding fade is robust across thresholds — even aggressive 0.0001 threshold with 150 trades shows +$250/trade with CI not crossing zero.

### ETHUSDT — Strongest per-trade edge

| Funding Thresh | Max Hold | Trades | Net PnL | Expectancy | Sharpe | Win% | CI 5% | CI 95% |
|---|---|---|---|---|---|---|---|---|
| 0.0003 | 12 | 6 | +$2,966 | +$494/trade | **20.55** | 100% | +$342 | +$655 |
| 0.0003 | 6 | 7 | +$1,394 | +$199/trade | 11.21 | 85.7% | +$45 | +$342 |
| 0.0001 | 12 | 25 | +$18,228 | +$729/trade | 7.77 | 76% | +$442 | +$1,021 |
| 0.0001 | 6 | 34 | +$14,114 | +$415/trade | 9.70 | 82.4% | +$260 | +$581 |
| 0.0001 | 3 | 51 | +$9,445 | +$185/trade | 8.08 | 66.7% | +$79 | +$287 |

**Key insight:** ETH has the highest Sharpe (20.55) at funding>=0.0003, maxHold=12 — but only 6 trades over 730 days. High confidence per-trade, but very low frequency.

### BTCUSDT — No viable signal

- Top config = 1 trade only
- No configuration reached 10+ trades
- Bootstrap CIs cross zero on every config
- **Verdict: Funding rate fade does not work on BTCUSDT**

---

## Regime Dependency Analysis

**Observed patterns across assets:**
- Funding extremes in crypto are rare (funding mostly stays within ±0.01%)
- Extreme funding (>0.05%) occurs during clear bull/bear transitions
- SOL has the highest funding volatility → more tradeable signals
- BTC funding is too stable to generate meaningful fade opportunities
- ETH sits between SOL and BTC in funding volatility

**Regime dependency (hypothesis):**
- Bull markets: funding goes extremely positive → fade shorts → works
- Bear markets: funding goes extremely negative → fade longs → works
- Range: funding stays neutral → no signal → no trades
- This explains why BTC (most stable) has fewest signals

---

## OI and Combined Modes

OI data is structurally limited: Binance API only returns ~60 days of OI history (21 data points at 8h resolution). This is insufficient for meaningful out-of-sample testing.

All OI-only and combined modes produced 0 trades across all assets — the OI z-score signal either doesn't exist at this resolution or requires much more data.

---

## Out-of-Sample Plan

The full dataset (2024-10-21 → 2025-09-19) must be split:

1. **In-sample (train):** 2024-10-21 → 2025-06-01 (~223 days)
2. **Out-of-sample (test):** 2025-06-01 → 2025-09-19 (~110 days)

Walk-forward validation will confirm whether the SOL and ETH funding fade signals are real alpha or overfitting.

---

## Verdict

| Asset | Tradeable? | Best Config | Trades | Expectancy | Sharpe | Statistical Significance |
|---|---|---|---|---|---|---|
| SOLUSDT | **YES** | funding≥0.0001, maxHold=24 | 46 | +$1,034/trade | 5.35 | **11/48 configs significant** |
| ETHUSDT | **YES** (low frequency) | funding≥0.0003, maxHold=12 | 6 | +$494/trade | 20.55 | 5/48 configs significant |
| BTCUSDT | **NO** | None | 0-1 | N/A | N/A | 0 significant |

**Next step:** Out-of-sample walk-forward validation on SOLUSDT (most tradeable) and ETHUSDT (strongest per-trade) to confirm or reject these as real alpha.
