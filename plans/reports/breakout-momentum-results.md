# Breakout & Momentum Strategy Test Results

**Date:** 2026-08-17
**Stress Mode:** conservative
**Cost Model:** fee=0.001, slip=0.0007, impact=0.001
**Data Source:** Binance cached 1h candles (BTC, ETH — ~1000 each)
**Bootstrap:** 1000 resamples per strategy/pair

## Strategy Descriptions

| ID | Name | Entry Rule | Exit Rule |
|---|---|---|---|
| A | SMA Crossover | Fast SMA(10) > Slow SMA(30) | Fast SMA < Slow SMA |
| B | Donchian Breakout | Close > 20-bar highest high | Close < 10-bar lowest low |
| C | Volume-Confirmed | SMA crossover + volume > 1.5x 20-bar avg | SMA crossover exit |
| D | Regime-Filtered | SMA crossover + TREND_UP regime only | SMA crossover exit or regime exit |

## Regime Filter (Strategy D)

TREND_UP = price > SMA(50) AND annualized volatility > 1%. All other regimes skipped.

## Performance Summary

| Pair | Strategy | Net PnL | Win Rate | Trades | Profit Factor | Sharpe | Max DD | p-value |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT | A: SMA Crossover | $-2103.27 | 50.0% | 22 | 1.89 | 3.1702 | -101.0% | 0.137 |
| BTCUSDT | B: Donchian Breakout | $-2594.33 | 43.8% | 16 | 1.38 | 1.4264 | -151.6% | 0.347 |
| BTCUSDT | C: Volume-Confirmed | $+2831.87 | 75.0% | 4 | 15.80 | 4.769 | -9.6% | 0.004 |
| BTCUSDT | D: Regime-Filtered | $-2103.27 | 50.0% | 22 | 1.89 | 3.1702 | -101.0% | 0.129 |
| ETHUSDT | A: SMA Crossover | $-173.45 | 31.6% | 19 | 1.25 | 1.0255 | -559.2% | 0.388 |
| ETHUSDT | B: Donchian Breakout | $-168.63 | 26.7% | 15 | 1.12 | 0.4385 | 0.0% | 0.485 |
| ETHUSDT | C: Volume-Confirmed | $+57.64 | 33.3% | 3 | 3.08 | 0 | -100.0% | 0.296 |
| ETHUSDT | D: Regime-Filtered | $-173.45 | 31.6% | 19 | 1.25 | 1.0255 | -559.2% | 0.371 |

## Bootstrap Significance (p < 0.05 = significant edge)

| Pair | Strategy | p-value | Significant? |
|---|---|---|---|
| BTCUSDT | A: SMA Crossover | 0.137 | NO |
| BTCUSDT | B: Donchian Breakout | 0.347 | NO |
| BTCUSDT | C: Volume-Confirmed | 0.004 | YES |
| BTCUSDT | D: Regime-Filtered | 0.129 | NO |
| ETHUSDT | A: SMA Crossover | 0.388 | NO |
| ETHUSDT | B: Donchian Breakout | 0.485 | NO |
| ETHUSDT | C: Volume-Confirmed | 0.296 | NO |
| ETHUSDT | D: Regime-Filtered | 0.371 | NO |

### Significant Results

**BTCUSDT / C: Volume-Confirmed**: p=0.004, PnL=$+2831.87, Sharpe=4.769, PF=15.80


---
*SOLUSDT 1h cache unavailable (only 4h cached) — excluded from this run.*
