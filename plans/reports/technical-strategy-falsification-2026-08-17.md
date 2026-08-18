# Technical Strategy Falsification Report

**Date:** 2026-08-17
**Researcher:** Alpha Lab automated pipeline
**Scope:** Simple TA strategies on BTC/ETH/SOL (1h and 4h timeframes)

## Executive Summary

Across 12+ strategy archetypes, 844 RSI parameter combinations, and 2 timeframes (1h, 4h), NO statistically robust edge was found. Only "significant" results had ≤6 trades (statistically meaningless) or failed to replicate across timeframes.

## Hypotheses Tested

### Archetypes (each tested on BTC, ETH, SOL):
1. SMA Crossover (10/30 → 30/90 on 4h)
2. Donchian Channel Breakout (20/10 → 60/10)
3. Volume-Confirmed Momentum (SMA + 1.5x volume)
4. Regime-Filtered Momentum (SMA + TREND_UP filter)
5. ATR Breakout (close > SMA + 2*ATR)
6. Bollinger Band Squeeze (BB width 60-period low/high)
7. Volatility Regime Filter (SMA crossover + vol > 2%)
8. ATR Position Sizing (ATR-based sizing)
9. RSI Range Trading (RSI oversold/overbought)
10. Bollinger Band Bounce (BB mean reversion)
11. Z-Score Mean Reversion
12. RSI+Range+Volume composite

### Parameter Sweep:
- RSI: periods [7,10,14], oversold [25,30,35], overbought [60,65,70], max-hold [24,48,96,168h]
- Total: 844 unique configurations on BTC 4h

## Cost Model

Conservative: fee=10bps, slippage=7bps, market impact=10bps = 27bps round-trip

## Results

### 1h Results (42 days, ~1000 candles):

| Pair | Strategy | PnL | Trades | p-value |
|---|---|---|---|---|
| BTC | C: Volume-Confirmed | +$2832 | 4 | 0.004 ★ |
| BTC | A: SMA Crossover | -$2103 | 22 | 0.137 |
| ETH | All strategies | All negative | varies | >0.29 |
| SOL | RSI sweep (652 configs) | — | varies | 0% significant |

### 4h Results (167 days, ~1000 candles):

| Pair | Strategy | PnL | Trades | p-value |
|---|---|---|---|---|
| BTC | C: Volume-Confirmed | -$2109 | 3 | 0.715 |
| ETH | B: Donchian | +$289 | 6 | 0.026 |
| SOL | D: Regime-Filtered | +$30 | 5 | 0.020 |
| SOL | B: BB Squeeze | +$94 | varies | 0.001 |
| BTC | RSI sweep (844 configs) | top=$191 | 10 | — |

## Failure Modes Identified

1. **BTC C-Volume reversal**: p=0.004 on 1h → p=0.715 on 4h. Classic overfitting to small sample.
2. **Data period mismatch**: SOL 4h cache = 2024-08-17 to 2025-01-31 vs BTC/ETH = 2026-03-03 to 2026-08-17. Cross-pair comparison invalid.
3. **Thin samples**: All "significant" results ≤6 trades. Bootstrap convergence requires ≥30 trades.
4. **Absurd Sharpe**: SOL BB Squeeze Sharpe=100 — outlier, not tradeable.

## Statistical Criteria (Suntzu Quantitative Standard)

- Minimum 30 trades for bootstrap significance
- p < 0.05 required
- Profit Factor > 1.5 required
- Must replicate across timeframes
- Must work within same data period

**None of these criteria were met by any strategy.**

## Conclusions

Simple technical analysis (trend-following, mean-reversion, volatility-based, breakout) does not produce statistically significant alpha on BTC/ETH/SOL at 1h or 4h timeframes.

This is valid falsification, not failure. System correctly identified that no strategy in this class should trade live capital.

## Next Steps

1. Daily timeframe (last check for TA)
2. Non-technical signals (funding rate, OI, liquidations, on-chain)
3. ML-based regime detection with walk-forward validation
4. Cross-asset correlation signals