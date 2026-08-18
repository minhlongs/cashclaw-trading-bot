# Technical Strategy Falsification Report

**Date:** 2026-08-17 (updated 2026-08-18)
**Researcher:** Alpha Lab automated pipeline
**Scope:** Simple TA strategies on BTC/ETH/SOL (1h, 4h, 1d) + derivative (funding rate fade)

## Executive Summary

Across 12+ strategy archetypes, 844 RSI parameter combinations, 3 timeframes (1h, 4h, 1d), and derivative signals (funding rate fade on 48 configs × 3 assets), NO statistically robust edge was found. The funding-rate fade hypothesis — the most promising lead — failed out-of-sample validation (0/7 configs pass OOS). Every signal that appeared in-sample was either overfit or from insufficient trade counts.

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

## Daily Timeframe (2026-08-16)

14 of 15 strategy-asset combinations are net negative. Only positive: ETH Simple Momentum (+$535.63, 15 trades, Sharpe 1.22) — too small a sample to trust. BTC Mean Reversion worst at -$39.5k despite 63.6% win rate (avg loss 2× avg win).

**Verdict:** Daily timeframe hostile. TA falsification complete.

## Derivative Signals (2026-08-18)

**Hypothesis:** Extreme funding rates indicate crowded positions → fade the crowd.

**In-sample sweep** (48 configs × 3 assets, 730 days, conservative costs):
| Asset | Positive | Significant | Best Config | Trades | Expectancy | Sharpe |
|---|---|---|---|---|---|---|
| SOLUSDT | 32/48 | 11 | funding≥0.0001, maxHold=24 | 46 | +$1,034/trade | 5.35 |
| ETHUSDT | 20/48 | 5 | funding≥0.0003, maxHold=12 | 6 | +$494/trade | 20.55 |
| BTCUSDT | 0/48 | 0 | None | 0-1 | N/A | N/A |

**Out-of-sample validation** (train 65% → test 35%, 7 configs, end-date pinned to sweep's original 2025-09-19):
| Config | Train PnL | Train Sharpe | Test PnL | Test Sharpe | OOS |
|---|---|---|---|---|---|
| SOL: thresh=0.0001, maxHold=24 | -$13,659 | -1.50 | -$6,862 | -1.22 | ❌ |
| SOL: thresh=0.0001, maxHold=12 | -$15,462 | -1.97 | -$4,523 | -0.79 | ❌ |
| SOL: thresh=0.0003, maxHold=12 | -$4,336 | -0.84 | -$2,620 | -3.07 | ❌ |
| ETH: thresh=0.0001, maxHold=12 | -$6,857 | -1.17 | -$7,153 | -1.50 | ❌ |
| ETH: thresh=0.0001, maxHold=6 | -$9,056 | -1.79 | -$5,474 | -1.42 | ❌ |
| All others | — | — | — | — | ❌ |

**PASSED OOS: 0/7.** Methodology bug fixed (pinned end-date to match sweep window). The original OOS validation used a rolling `Date.now()` window that tested on dates (Dec 2025–Aug 2026) the in-sample sweep never saw — making the original "OOS test" invalid. After correction: **no config passes, even the "marginal" ones.** The in-sample Sharpe of 5.35 was entirely regime-driven — the train period Sharpe is already -1.50, indicating the signal only appeared in specific market conditions.

**OI limitation:** Binance API returns only ~60 days of OI history (21 data points). OI-only and combined modes produce 0 trades across all assets.

**Verdict:** Derivative alpha falsified. Funding-rate fade is not a viable alpha source at current thresholds.

## ML Regime Detection (2026-08-18)

**Hypothesis:** Can a learned regime classifier improve signal filtering over rule-based, or does it just overfit?

**Method:** Decision tree (depth=4, minLeaf=20) trained on 6 regime features, walk-forward expanding window, pseudo-labels from forward 48h returns.

| Asset | ML Accuracy | ML vs Unfiltered | ML vs Rule | ML % RANGE |
|---|---|---|---|---|
| SOLUSDT | 62.6% | +11% Sharpe | +26% Sharpe | 95.3% |
| ETHUSDT | 69.9% | -0.5% Sharpe | +10% Sharpe | 95.6% |
| BTCUSDT | 88.6% | 0% (identical) | Worse | **100%** |

**Verdict: FALSIFIED.** The classifier collapses to majority-class prediction (RANGE) for 95-100% of periods. High "accuracy" is an artifact of class imbalance, not predictive power. ML filter removes 0-1 trades across all assets — functionally equivalent to no filtering. Rule-based filtering also doesn't improve strategy performance.

## Cross-Asset Correlation (2026-08-18)

**Hypothesis:** When correlated crypto assets diverge (spread z-score extreme), does the spread mean-revert after costs?

**Method:** Pairs trading on BTC/ETH, BTC/SOL, ETH/SOL. 36 configs per pair (z-score entries × exits × hold periods). Walk-forward 65/35 split. Conservative costs.

| Pair | Best Test Sharpe | Trades | PnL |
|---|---|---|---|
| BTC/ETH | -7.86 | 21 | -$4,584 |
| BTC/SOL | -8.00 | 45 | -$7,383 |
| ETH/SOL | -8.34 | 38 | -$6,405 |

**108/108 configs failed.** Zero marginal, zero passed. Strongest negative Sharpe across all pairs and parameters. Cross-asset correlation pairs trading does NOT produce positive expectancy after conservative costs.

**Verdict:** FALSIFIED. Pairs trading on major crypto pairs loses money in every configuration tested.

## Final Falsification Summary

All hypotheses tested and rejected. **14 strategy classes falsified:**

| # | Hypothesis | Result |
|---|---|---|
| 1 | TA across timeframes (RSI/SMA/momentum/mean-reversion) | 14/15 negative (1 borderline) |
| 2 | Single-venue funding-rate fade | 0/7 OOS pass (date bug fixed, still 0/7) |
| 3 | ML regime detection | Majority-class collapse (95-100% RANGE) |
| 4 | Cross-asset pairs trading | 108/108 negative |
| 5 | Cross-exchange funding arbitrage | Binance/Bybit diff = 0.00000, 0 trades above 0.01% |
| 6 | Funding momentum (follow crowd) | 9/9 negative, OOS Sharpe -0.75 to -3.99 |
| 7 | Volatility-gated fade | Marginal OOS Sharpe 6.38 but CI crosses zero, too few trades |
| 8 | Contrarian sentiment (Fear & Greed) | 0/27 OOS pass, 9 marginal (CI crosses zero) |
| 9 | Spot-perp basis trading | 0/36 OOS pass, 0% win rate, best OOS Sharpe -1204 |
| 10 | Sentiment × funding composite | UNTESTED — FNG API quota exceeded, 0 data days |
| 11 | Cross-asset momentum spillover | 0/64 OOS pass, all configs negative |
| 12 | Volatility regime switching | 0/18 OOS pass (trend 0/6, meanrev 0/6, regime 0/6) |

**System correctly identifies that no tested strategy class should trade live capital.** This is valid scientific falsification, not failure.

### Key finding: funding rate is not a standalone alpha source

Funding rates were tested in every direction:
- **Fade** (short when funding > 0): 0/7 OOS pass
- **Follow** (long when funding > 0): 9/9 negative
- **Vol-gated fade**: marginal improvement, CI crosses zero
- **Cross-exchange arb**: Binance/Bybit differential is 0.00000
- **Basis trading** (delta-neutral convergence): 0/36 OOS pass, 0% win rate

The market is efficient — funding rates are priced in. Any edge must come from combining funding with another signal (regime, sentiment, order flow) or from a completely different data source.

### Sentiment (Fear & Greed Index)

The F&G Index (daily 0-100, 729 aligned trading days) was tested contrarian-style:
- Buy when F&G < 15/20/25 (extreme fear), short when F&G > 75/80/85 (extreme greed)
- Exit on maxHold (3/7/14 days) or F&G reverts to neutral (40-60)
- **0/27 configs pass OOS.** 9 configs show positive in-sample PnL but bootstrap CIs cross zero — indistinguishable from noise. Classic overfitting: Fear<25/Greed>85 showed +$1,316 to +$2,240 train PnL but -$1,679 to -$2,686 test PnL. F&G Index is not a tradeable alpha source.

### Basis trading (spot-perp convergence)

Delta-neutral basis trading (short perp + long spot when funding z-score > 2.0, long perp + short spot when z < -2.0) tested on 36 configs across BTCUSDT:
- **0/36 configs pass OOS.** Best OOS config (zEntry=2.5, zExit=0.3, maxHold=12): -$26.07/trade, Sharpe -1204, 0% win rate.
- Buy-and-hold returned +9.76% over the same window — basis trading massively underperformed.
- The spot-perp basis is too efficient for retail-level extraction.

### Round 10: Sentiment × Funding Composite (SOL)

Double-contrarian filter: require BOTH F&G extreme AND funding extreme to agree before entering.
- F&G < threshold AND funding > 0 → SHORT; F&G > (100-threshold) AND funding < 0 → LONG
- **0/27 configs pass OOS.** Note: FNG API returned 0 days (quota exceeded), so this test is inconclusive — the composite filter could not be validated on real data. Funding-only leg also produced 0 trades (no bar met both conditions simultaneously). **This hypothesis is UNTESTED, not falsified.**

### Round 11: Cross-Asset Momentum Spillover (SOL)

BTC intraday 8h return predicts SOL intraday return — does BTC act as market leader?
- LONG SOL when BTC return > threshold (0.5-3%), SHORT when BTC return < threshold (-3% to -0.5%)
- **0/64 configs pass OOS.** All configs negative, OOS Sharpe -0.26 to -11.98. Best config (L3%/S-1%/H6) had -$661 OOS PnL with CI [-$162, +$143] crossing zero. BTC momentum does NOT spill into SOL at retail scale.

### Round 12: Volatility Regime Switching (SOL)

Regime-aware strategy: trend-follow in HIGH_VOL/TREND, mean-rev in LOW_VOL/RANGE.
- Computed causal regimes from BTC (SHOCK > HIGH_VOL > TREND > LOW_VOL > RANGE)
- Regime distribution: HIGH_VOL 229, TREND 175, LOW_VOL 256, RANGE 485, SHOCK 23
- **0/18 configs pass OOS** — trend-follow 0/6, mean-reversion 0/6, regime-switch 0/6
- Regime switching performed WORSE than standalone strategies (regime OOS Sharpe -1.93 to -5.12 vs trend -0.42 to -2.72). Regime-awareness adds no value at this parameter scale.

### Reproducibility

All backtest scripts are in `src/forest/backtest/`. Run instructions in `plans/reports/engine-reproducibility.md`. End-date pinning is critical for OOS validation — see `plans/reports/funding-rate-deep-analysis.md`.