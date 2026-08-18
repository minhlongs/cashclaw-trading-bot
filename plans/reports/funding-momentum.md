# Funding Momentum Backtest — SOLUSDT

**Hypothesis:** Following the crowd on funding rates produces alpha.
(Funding > 0 → LONG, Funding < 0 → SHORT — carry-trade logic.)

| Parameter | Value |
|-----------|-------|
| Symbol | SOLUSDT |
| Funding periods | 2190 |
| Cost model | conservative |
| Bootstrap resamples | 1000 |
| OOS split | 65% / 35% |

## Full Period Results

| Threshold | MaxHold | Trades | Net PnL | Win Rate | Expectancy | Sharpe | 95% CI | Profit Factor | Max DD |
|-----------|---------|--------|---------|----------|------------|--------|--------|---------------|--------|
| 0.0005 | 24 | 134 | $-1397.99 | 40.3% | $-10.43 | -0.50 | [-$43.69 to +$29.02] | 0.87 | 23.6% |
| 0.0005 | 12 | 168 | $-2407.12 | 45.8% | $-14.33 | -0.90 | [-$40.79 to +$12.84] | 0.81 | 32.2% |
| 0.0005 | 6 | 247 | $-4555.52 | 42.5% | $-18.44 | -1.99 | [-$36.39 to -$0.43] | 0.71 | 51.5% |
| 0.0001 | 12 | 183 | $-3604.15 | 42.1% | $-19.69 | -1.15 | [-$46.11 to +$7.26] | 0.77 | 43.2% |
| 0.0003 | 24 | 136 | $-2699.91 | 39.0% | $-19.85 | -0.94 | [-$52.88 to +$15.28] | 0.77 | 34.8% |
| 0.0003 | 12 | 174 | $-3459.83 | 43.1% | $-19.88 | -1.17 | [-$47.63 to +$7.61] | 0.76 | 42.5% |
| 0.0001 | 6 | 290 | $-6642.10 | 44.1% | $-22.90 | -2.41 | [-$38.75 to -$7.99] | 0.65 | 69.8% |
| 0.0001 | 24 | 136 | $-3195.04 | 39.7% | $-23.49 | -1.09 | [-$58.82 to +$10.95] | 0.74 | 39.1% |
| 0.0003 | 6 | 277 | $-6527.67 | 43.3% | $-23.57 | -2.51 | [-$40.42 to -$8.93] | 0.64 | 69.2% |

## Out-of-Sample Results

| Threshold | MaxHold | Train Exp. | Test Exp. | Train Sharpe | Test Sharpe | Degradation |
|-----------|---------|------------|-----------|--------------|-------------|-------------|
| 0.0005 | 12 | $-16.19 | $-10.89 | -0.97 | -0.75 | -32.7% |
| 0.0005 | 6 | $-15.34 | $-24.14 | -1.62 | -2.74 | 57.3% |
| 0.0005 | 24 | $2.66 | $-34.67 | 0.12 | -2.04 | 1403.7% |
| 0.0001 | 6 | $-15.96 | $-35.70 | -1.63 | -3.99 | 123.6% |
| 0.0003 | 6 | $-16.25 | $-37.14 | -1.68 | -4.22 | 128.6% |
| 0.0003 | 12 | $-7.61 | $-42.62 | -0.42 | -2.86 | 459.9% |
| 0.0001 | 12 | $-6.01 | $-44.53 | -0.33 | -2.98 | 640.3% |
| 0.0003 | 24 | $-3.20 | $-50.39 | -0.14 | -2.82 | 1476.0% |
| 0.0001 | 24 | $-4.77 | $-57.83 | -0.21 | -3.18 | 1113.2% |

## Verdict

**No configuration produces positive OOS expectancy.**

Funding momentum (following the crowd) does NOT produce alpha on this asset/timeframe.
This is consistent with the fading backtest — neither direction on funding rates works as a standalone signal.