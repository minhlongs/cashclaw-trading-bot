# ML Regime Detection — Walk-Forward Validation

**Date:** 2026-08-18
**Assets:** SOLUSDT, ETHUSDT, BTCUSDT
**Model:** Decision tree (depth=4, minLeaf=20), from scratch, no libraries
**Labels:** Forward 48h returns → RANGE / TREND_UP / TREND_DOWN / HIGH_VOL
**Method:** Walk-forward expanding window (train→predict, roll forward)
**Cost model:** Conservative (fee=0.1%, slippage=0.07%, impact=0.1%)

---

## Hypothesis

Can a learned regime classifier improve signal filtering over rule-based regime detection, or does it just overfit?

---

## Cross-Asset Results

| Metric | SOLUSDT | ETHUSDT | BTCUSDT |
|---|---|---|---|
| ML accuracy | 62.6% | 69.9% | 88.6% |
| ML filter vs unfiltered | **+11% Sharpe** | **-0.5% Sharpe** | **0% (identical)** |
| ML filter vs rule-based | **+26% Sharpe** | **+10% Sharpe** | **Worse** |
| ML % predicted as RANGE | 95.3% | 95.6% | **100%** |
| ML trades (non-volatile) | 128 | 89 | 79 |
| Unfiltered trades | 128 | 90 | 79 |

---

## Detailed Results

### SOLUSDT (most tradeable asset)

| Filter | Trades | Net PnL | Sharpe | CI 5% | CI 95% |
|---|---|---|---|---|---|
| Unfiltered | 128 | +$55,736 | 4.98 | | |
| ML (non-volatile) | 128 | +$61,412 | **5.55** | | |
| Rule (non-volatile) | 65 | +$30,349 | 4.40 | | |
| ML (trending only) | 5 | -$1,389 | -0.97 | | |
| Rule (trending only) | 52 | +$30,302 | 4.52 | | |

### ETHUSDT

| Filter | Trades | Net PnL | Sharpe |
|---|---|---|---|
| Unfiltered | 90 | +$29,584 | 3.96 |
| ML (non-volatile) | 89 | +$28,580 | 3.94 |
| Rule (non-volatile) | 53 | +$17,098 | 3.59 |
| ML (trending only) | 2 | -$121 | -0.77 |
| Rule (trending only) | 38 | +$14,247 | 3.58 |

### BTCUSDT

| Filter | Trades | Net PnL | Sharpe |
|---|---|---|---|
| Unfiltered | 79 | -$1,247 | -0.29 |
| ML (non-volatile) | 79 | -$1,247 | -0.29 |
| Rule (non-volatile) | 76 | -$467 | -0.11 |
| Rule (trending only) | 58 | +$439 | 0.10 |
| ML (trending only) | 0 | $0 | 0.00 |

---

## Why ML Fails

### 1. Majority-class collapse

The classifier learns to predict RANGE for 95-100% of all periods. Since RANGE is the dominant regime (73-88% of all labels), this achieves "high accuracy" while being completely useless as a filter:

| Asset | RANGE % of labels | ML predicts RANGE % |
|---|---|---|
| SOL | 72.4% | 95.3% |
| ETH | 80.8% | 95.6% |
| BTC | 98.0% | **100.0%** |

This is a textbook majority-class problem: the decision tree achieves "accuracy" by predicting the most common label for every period.

### 2. ML filter doesn't actually filter

On SOL, ML keeps all 128 trades (identical to unfiltered). On ETH, it removes exactly 1 trade. On BTC, it removes 0. The classifier is functionally equivalent to no filtering at all.

### 3. Rule-based is better when it filters

When rule-based filtering removes trades, Sharpe actually drops (SOL: 4.40 vs 4.98). This suggests the regime signal itself — whether rule-based or ML — does not improve the funding-rate fade strategy. The strategy's performance is driven by funding extremes, not regime conditions.

### 4. BTC: trivially high accuracy from class imbalance

BTC's 88.6% accuracy sounds impressive but is trivially achieved by predicting RANGE for everything. BTC labels are 98% RANGE — the classifier literally cannot learn anything useful.

---

## Verdict

**ML regime detection is FALSIFIED as a signal quality improvement tool for funding-rate fade.**

The classifier either:
1. Collapses to majority-class prediction (BTC, ETH) — functionally useless
2. Marginally improves Sharpe but doesn't actually filter any trades (SOL) — functionally identical to unfiltered

The high "accuracy" numbers are misleading artifacts of class imbalance, not evidence of predictive power. This is a valid scientific finding: regime classification adds no value to this strategy.

**Next steps:** Cross-asset correlation signals (Phase 4 of falsification roadmap), or pivot to hypothesis-driven research on what DOES drive the funding-rate fade signal.
