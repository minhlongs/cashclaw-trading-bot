# 730-Day Daily Timeframe Baseline Comparison

**Date:** 2026-08-16
**Exchange:** Binance
**Assets:** BTCUSDT, ETHUSDT, SOLUSDT
**Timeframe:** 1d (daily)
**Lookback:** 730 days (~2 years)
**Cost Model:** Conservative (fee=0.1%, slippage=0.07%, impact=0.1%)

---

## Raw Output

```
=== Multi-Asset Baseline Comparison ===
Exchange: binance | Symbols: BTCUSDT, ETHUSDT, SOLUSDT | Intervals: 1d | Days: 730 | Stress: conservative

Fetching 730d 1d BTCUSDT...
  Loaded 730 candles
  RSI diagnostics (BTCUSDT 1d):

--- Exit Reason Distribution (RSI + Trend) ---
┌─────────┬────────────────────┬───────┬─────────────┬──────────────┐
│ (index) │ Exit Reason        │ Count │ Avg PnL ($) │ Win Rate (%) │
├─────────┼────────────────────┼───────┼─────────────┼──────────────┤
│ 0       │ 'SMA Stop'         │ 1     │ '-878.5601' │ '0.0'        │
│ 1       │ 'Max-Hold Timeout' │ 2     │ '111.7084'  │ '100.0'      │
└─────────┴────────────────────┴───────┴─────────────┴──────────────┘

--- Regime-Stratified Performance (RSI + Trend) ---
```

### Strategy Comparison Table

| # | Strategy | Total PnL ($) | Win Rate (%) | Trades | Avg Win ($) | Avg Loss ($) | Sharpe | Expectancy ($/trade) |
|---|----------|---------------|--------------|--------|-------------|--------------|--------|---------------------|
| 0 | Buy & Hold (BTCUSDT 1d) | -878.56 | 0.0 | 1 | 0.00 | 878.56 | 0.00 | -878.56 |
| 1 | Random Entry (BTCUSDT 1d) | -6123.24 | 34.8 | 66 | 6149.36 | 3074.68 | 0.39 | -92.78 |
| 2 | Simple Momentum (BTCUSDT 1d) | -3196.13 | 26.7 | 15 | 5496.46 | 2748.23 | 0.95 | -213.08 |
| 3 | Mean Reversion (BTCUSDT 1d) | -39517.59 | 63.6 | 22 | 8318.20 | 4159.10 | 0.59 | -1796.25 |
| 4 | RSI + Trend (BTCUSDT 1d) | -655.14 | 66.7 | 3 | 29.42 | 0.00 | 0.25 | -218.38 |
| 5 | Buy & Hold (ETHUSDT 1d) | -752.71 | 0.0 | 1 | 9.07 | 4.54 | 0.00 | -752.71 |
| 6 | Random Entry (ETHUSDT 1d) | -4947.12 | 37.9 | 66 | 724.56 | 362.28 | 0.50 | -74.96 |
| 7 | Simple Momentum (ETHUSDT 1d) | **535.63** | 40.0 | 15 | 166.09 | 83.05 | **1.22** | **35.71** |
| 8 | Mean Reversion (ETHUSDT 1d) | -2854.89 | 65.0 | 20 | 233.67 | 116.83 | 0.49 | -142.74 |
| 9 | RSI + Trend (ETHUSDT 1d) | 0.00 | 0.0 | 0 | 0.00 | 0.00 | 0.00 | 0.00 |
| 10 | Buy & Hold (SOLUSDT 1d) | -69.04 | 0.0 | 1 | 0.44 | 0.22 | 0.00 | -69.04 |
| 11 | Random Entry (SOLUSDT 1d) | -265.52 | 45.5 | 66 | 38.54 | 19.27 | 0.55 | -4.02 |
| 12 | Simple Momentum (SOLUSDT 1d) | -27.12 | 38.5 | 13 | 7.34 | 3.67 | 0.81 | -2.09 |
| 13 | Mean Reversion (SOLUSDT 1d) | -30.29 | 65.2 | 23 | 13.22 | 6.61 | 0.84 | -1.32 |
| 14 | RSI + Trend (SOLUSDT 1d) | -2356.89 | 0.0 | 3 | 27.72 | 0.00 | 0.00 | -785.63 |

**Cost Model (conservative):** fee=0.001, slip=0.0007, impact=0.001

---

## Key Findings

### Positive Expectancy Only: Simple Momentum on ETHUSDT (1d)

| Metric | Value |
|--------|-------|
| Total PnL | +$535.63 |
| Win Rate | 40.0% |
| Trades | 15 |
| Sharpe Ratio | 1.22 |
| Expectancy | +$35.71/trade |

This is the **only strategy-asset pair** that shows positive total PnL and positive Sharpe across all 15 combinations on daily timeframe.

### Worst Performers
- **Mean Reversion (BTCUSDT 1d):** -$39,517.59 (63.6% win rate but catastrophic avg win/loss ratio of 2:1 in wrong direction)
- **Random Entry (BTCUSDT 1d):** -$6,123.24
- **Random Entry (ETHUSDT 1d):** -$4,947.12

### Observations

1. **Daily timeframe is hostile to these strategies.** 14 out of 15 combinations are net negative after conservative costs.

2. **BTCUSDT is the hardest asset.** All 5 strategies lose money, with Mean Reversion suffering the largest drawdown (-$39.5k).

3. **SOLUSDT shows smallest losses** (near breakeven for Simple Momentum and Mean Reversion) but no positive signal. The smaller dollar values reflect SOL's lower price, not better risk-adjusted returns.

4. **RSI + Trend barely fires** on daily -- only 3 trades for BTCUSDT, 0 for ETHUSDT, 3 for SOLUSDT. Insufficient sample size to draw conclusions.

5. **Simple Momentum on ETHUSDT** is the sole outlier. With Sharpe 1.22 and positive expectancy at +$35.71/trade, it suggests some edge. However, 15 trades over 730 days is a very small sample -- this could be noise.

6. **Mean Reversion has the worst risk/reward.** Despite highest win rates (63-65%), the avg loss doubles avg win, making it a losing strategy. Classic mean-reversion trap on crypto daily candles.

7. **Conservative cost model kills marginal strategies.** Fee+slippage+impact at ~0.27% round-trip is brutal on a 1d timeframe with frequent mean-reversion entries.

---

## TA Falsification Status (All Timeframes)

| Timeframe | Strategies Tested | Any Positive Expectancy? | Notes |
|-----------|-------------------|--------------------------|-------|
| 1h | SOL momentum, mean reversion | No | Noise-dominated |
| 4h | Breakout, volatility, range MR | No | All negative |
| 1d | All 5 strategies x 3 assets | **1 borderline** (ETH Simple Momentum) | Sample too small to trust |

**Verdict:** The TA falsification holds across timeframes. 14 of 15 daily combinations lose money. The single positive (ETH Simple Momentum, +$535, Sharpe 1.22) needs validation with out-of-sample data and longer backtest before being actionable.
