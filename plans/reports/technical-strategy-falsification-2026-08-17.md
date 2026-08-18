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

All hypotheses tested and rejected. **20 strategy classes falsified or inconclusive:**

| # | Hypothesis | Result | Status |
|---|---|---|---|
| 1 | TA across timeframes (RSI/SMA/momentum/mean-reversion) | 14/15 negative (1 borderline) | FALSIFIED |
| 2 | Single-venue funding-rate fade | 0/7 OOS pass | FALSIFIED |
| 3 | ML regime detection | Majority-class collapse (95-100% RANGE) | FALSIFIED |
| 4 | Cross-asset pairs trading | 108/108 negative | FALSIFIED |
| 5 | Cross-exchange funding arbitrage | Binance/Bybit diff = 0.00000, 0 trades | FALSIFIED |
| 6 | Funding momentum (follow crowd) | 9/9 negative, OOS Sharpe -0.75 to -3.99 | FALSIFIED |
| 7 | Volatility-gated fade | Marginal Sharpe 6.38 but CI crosses zero | FALSIFIED |
| 8 | Contrarian sentiment (Fear & Greed) | 0/27 OOS pass | FALSIFIED |
| 9 | Spot-perp basis trading | 0/36 OOS pass, 0% win rate | FALSIFIED |
| 10 | Sentiment × funding composite (v2) | 0/27 OOS pass | FALSIFIED |
| 11 | Cross-asset momentum spillover | 0/64 OOS pass, all negative | FALSIFIED |
| 12 | Volatility regime switching | 0/18 OOS pass (all 0/6) | FALSIFIED |
| 13 | Cross-timeframe momentum confirmation | 3/48 OOS — robustness check confirms noise | FALSIFIED |
| 14 | Volume-price divergence | 1/48 OOS — noise floor | FALSIFIED |
| 15 | Session-aware mean reversion | 4/48 OOS — weekend 4/24, Asian 0/24 | NOISE (inconclusive) |
| 16 | VVOL regime (vol-of-vol) | 2/48 OOS — only 5 trades, noise floor | FALSIFIED |
| 17 | Cross-exchange volume divergence | 0/36 OOS — NaN data, zero trades | FALSIFIED |
| 18 | Funding rate momentum decay | 0/54 OOS significant (11 positive) | FALSIFIED |
| 19 | Correlation regime shift (SOL/BTC) | 7/54 SOL, 3/54 ETH — asset-specific | NOISE (inconclusive) |
| 20 | Open interest momentum (daily) | 13/72 SOL, 1/72 ETH — asset-specific | NOISE (inconclusive) |
| 21 | Wick exhaustion reversal | 0/24 OOS pass | FALSIFIED |
| 22 | Volume compression breakout | 0/32 OOS pass | FALSIFIED |
| 23 | Mean reversion at sigma extremes | 1/36 OOS pass — noise floor | FALSIFIED |
| 24 | Funding × price extreme interaction | 12/27 SOL, 2/27 ETH, 0/27 other window — regime-specific | CANDIDATE (inconclusive) |

### Round 13: Session-Aware Mean Reversion (SOL 8h)

RSI mean reversion filtered by trading session (weekend / Asian overnight / US hours).
- Weekend session: 4/24 OOS pass (but 9 trades per config — low sample)
- Asian session: 0/24 OOS pass
- **4/48 total pass.** Weekend signal is weak but reproducible in-sample — OOS CI crosses zero for most configs. Not robust.

### Round 14: VVOL (Vol-of-Vol) Regime (SOL 8h)

VVOL spikes (z>2 or z>3) precede reversals — fade the vol spike.
- **2/48 OOS pass** (volWindow=12, vvolWindow=6, zThr=2, rocThr=0.01, maxHold=24: Sharpe 8.59, CI[$18.60,$70.00])
- But only 5 OOS trades per passing config — well below 30-trade bootstrap threshold
- **Noise floor.** 2/48 ≈ expected false positive rate at 5% significance

### Round 14b: Cross-Exchange Volume Divergence (SOL, Binance/OKX)

Volume ratio between Binance and OKX signals smart money flow.
- OKX API returned NaN/Infinity volume data — ratio computation produced 0 trades across all 36 configs
- **0/36 OOS pass. FALSIFIED.** Cross-exchange volume ratio is not a usable signal with available data.

### Round 15: Funding Rate Momentum Decay (SOL 8h)

Funding rate ROC predicts next-period price: LONG on positive ROC, SHORT on negative ROC.
- 2190 funding periods, 78.3% positive rates
- Full-period: best config (rocP=1, longTh=0.00001, shortTh=-0.00005, maxH=6): 288 trades, $91,798 PnL, Sharpe 1.12
- **OOS: 11 positive, 0 significant** (CI crosses zero for all). FALSIFIED.
- Note: strong full-period performance with 288 trades but zero OOS significance → classic overfitting

### Round 16: Correlation Regime Shift (SOL/BTC daily)

Rolling BTC-SOL correlation breakdown signals regime shift. Breakdown in uptrend → LONG, breakdown in downtrend → SHORT.
- 54 configs, SOL daily 397 candles
- **7/54 OOS pass on SOL, 3/54 on ETH** (robustness check)
- Asset-specific: signal appears on SOL but not ETH. Not generalizable across crypto.

### Round 17: Open Interest Momentum (SOL daily)

Volume-weighted OI momentum divergence from price predicts reversal.
- 72 configs, SOL daily, volume-weighted OI proxy (real OI endpoint only returns ~31 records)
- **13/72 OOS pass on SOL, 1/72 on ETH** — same pattern as correlation regime: asset-specific
- Not generalizable across crypto assets

### Round 18: Wick Exhaustion Reversal (SOL 8h)

Large candle wicks (price rejection) on consecutive bars signal exhaustion → mean reversion.
- 24 configs (wickThreshold 0.5-0.7, lookback 3-5, devSMA 2-5%, maxHold 6-12)
- **0/24 OOS pass. FALSIFIED.** Wick geometry does not produce OOS alpha.

### Round 19: Volume Compression Breakout (SOL 8h)

Low-volume quiet period → volume expansion in prevailing direction.
- 32 configs (compressionWindow 12-24, compressionThreshold 0.5-0.7, expansionMultiplier 1.5-2.0, directionLookback 6-12, maxHold 6-12)
- **0/32 OOS pass. FALSIFIED.** Volume regime transitions do not produce OOS alpha.

### Round 20: Mean Reversion at Sigma Extremes (SOL 8h)

Price reaching N std devs from SMA → mean reverts. More extreme = stronger signal.
- 36 configs (smaPeriod 20-80, deviationSigma 1.5-3.0, maxHold 6-24)
- **1/36 OOS pass** — single config, 5-6 OOS trades. Noise floor. FALSIFIED.

### Round 21: Funding × Price Extreme Interaction (SOL 8h) ⚠️ BREAKTHROUGH

**Extreme funding AND extreme price → forced positioning unwinds predictably.**
- SHORT when funding>threshold AND z-score>priceSigma (fade crowded longs at price extreme)
- LONG when funding<-threshold AND z-score<-priceSigma (fade crowded shorts at price extreme)
- 27 configs, 1190 candles + 2190 funding periods, pinned end-date 2025-09-19
- **12/27 OOS pass** — first real signal in 27 hypothesis classes
- Best config: fundThr=0.0005, priceSig=1.5, maxHold=24 → 6 OOS trades, $5,552 PnL, Sharpe 4.67, CI[$699,$1,152]
- Second: fundThr=0.0003, priceSig=2.0, maxHold=24 → 6 OOS trades, $2,695 PnL, Sharpe 1.53, CI[$395,$942]
- **Robustness check complete:**
  - SOL 2025-09-19 window: **12/27 PASS** (strong in-sample)
  - SOL 2024-09-19 window: **0/27 PASS — DATA FETCH FAILURE (only 95 candles fetched, invalid test)**
  - ETH 2025-09-19 window (different asset): **2/27 PASS** — weak
- **WALK-FORWARD VALIDATION COMPLETE — NO-GO.** 6 rolling windows (548d train / 182d test, 2020-2024), 27 configs × 6 windows = 162 OOS tests, 1032 total OOS trades.
  - Window 1 (Apr–Oct 2022): **9/27 PASS**
  - Window 2 (Oct 2022–Apr 2023): **0/27 PASS**
  - Window 3 (Apr–Oct 2023): **1/27 PASS**
  - Window 4 (Oct 2023–Apr 2024): **0/27 PASS**
  - Window 5 (Apr–Oct 2024): **0/27 PASS**
  - Window 6 (Oct 2024–Apr 2025): **0/27 PASS**
  - **Total: 10/162 OOS passes (6%), aggregate PnL -$455,090.**
  - **No config passes in more than 1/6 windows.** Signal is purely regime-locked to mid-2022 bear market.
  - **Classification: FALSIFIED.** This is regime-specific overfitting, not persistent alpha. The 12/27 on SOL 2025-09-19 was an artifact of the 2022-2023 recovery regime, not a reproducible edge. See `funding-price-extreme-walkforward.ts` and report `plans/reports/funding-price-extreme-walkforward-solusdt-1758240000000.md`.

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

### Round 10: Sentiment × Funding Composite (SOL, v2)

Double-contrarian filter: require BOTH F&G extreme AND funding extreme to agree before entering.
- F&G < threshold AND funding > 0 → SHORT; F&G > (100-threshold) AND funding < 0 → LONG
- v2 uses 365-day lookback ending at Date.now() so FNG data is available (v1 used 730-day with pinned end-date yielding 0 FNG days).
- **0/27 configs pass OOS.** Only 1 config (FNG<15, fund>0.0001, H6) produced 5 OOS trades but with Sharpe -4590 and CI crossing zero. The composite filter does not produce reliable alpha on SOLUSDT.

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