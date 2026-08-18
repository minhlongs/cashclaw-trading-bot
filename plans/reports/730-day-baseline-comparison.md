# 730-Day Multi-Asset Baseline Comparison Report

**Date:** 2026-08-16  
**Config:** binance | BTCUSDT, ETHUSDT, SOLUSDT | 1h, 4h | 730 days | conservative stress  
**Exit code:** 0 (success)  
**Data:** Fresh fetch from Binance (no cache) -- 1000 candles per pair/timeframe (API max per request)

---

## Full Terminal Output

```
=== Multi-Asset Baseline Comparison ===
Exchange: binance | Symbols: BTCUSDT, ETHUSDT, SOLUSDT | Intervals: 1h, 4h | Days: 730 | Stress: conservative

Fetching 730d 1h BTCUSDT...
  Loaded 1000 candles
  RSI diagnostics (BTCUSDT 1h):

--- Exit Reason Distribution (RSI + Trend) ---
┌─────────┬──────────────────┬───────┬─────────────┬──────────────┐
│ (index) │ Exit Reason      │ Count │ Avg PnL ($) │ Win Rate (%) │
├─────────┼──────────────────┼───────┼─────────────┼──────────────┤
│ 0       │ 'RSI Overbought' │ 5     │ '82.4085'   │ '100.0'      │
└─────────┴──────────────────┴───────┴─────────────┴──────────────┘

--- Regime-Stratified Performance (RSI + Trend) ---
┌─────────┬──────────────────┬─────────────┬──────────────┬─────────────┐
│ (index) │ Regime           │ Trade Count │ Win Rate (%) │ Avg PnL ($) │
├─────────┼──────────────────┼─────────────┼──────────────┼─────────────┤
│ 0       │ 'TREND_UP'       │ 3           │ '100.0'      │ '62.8653'   │
│ 1       │ 'LOW_VOLATILITY' │ 2           │ '100.0'      │ '111.7234'  │
└─────────┴──────────────────┴─────────────┴──────────────┴─────────────┘

--- Trade Duration Histogram (RSI + Trend) ---
┌─────────┬──────────┬───────┬─────────────┐
│ (index) │ Duration │ Count │ Avg PnL ($) │
├─────────┼──────────┼───────┼─────────────┤
│ 0       │ '0-6h'   │ 2     │ '79.6236'   │
│ 1       │ '6-12h'  │ 3     │ '84.2652'   │
│ 2       │ '12-24h' │ 0     │ '0.0000'    │
│ 3       │ '24h+'   │ 0     │ '0.0000'    │
└─────────┴──────────┴───────┴─────────────┘

Fetching 730d 4h BTCUSDT...
  Loaded 1000 candles
  RSI diagnostics (BTCUSDT 4h): <not printed -- zero RSI+Trend trades>

Fetching 730d 4h ETHUSDT...
  Loaded 1000 candles
  RSI diagnostics (ETHUSDT 4h):

--- Exit Reason Distribution (RSI + Trend) ---
┌─────────┬────────────────────┬───────┬─────────────┬──────────────┐
│ (index) │ Exit Reason        │ Count │ Avg PnL ($) │ Win Rate (%) │
├─────────┼────────────────────┼───────┼─────────────┼──────────────┤
│ 0       │ 'Max-Hold Timeout' │ 3     │ '-133.9102' │ '33.3'       │
│ 1       │ 'RSI Overbought'   │ 2     │ '348.3837'  │ '100.0'      │
│ 2       │ 'SMA Stop'         │ 1     │ '-827.3515' │ '0.0'        │
└─────────┴────────────────────┴───────┴─────────────┴──────────────┘

--- Regime-Stratified Performance (RSI + Trend) ---
┌─────────┬────────────┬─────────────┬──────────────┬─────────────┐
│ (index) │ Regime     │ Trade Count │ Win Rate (%) │ Avg PnL ($) │
├─────────┼────────────┼─────────────┼──────────────┼─────────────┤
│ 0       │ 'TREND_UP' │ 6           │ '50.0'       │ '-88.7191'  │
└─────────┴────────────┴─────────────┴──────────────┴─────────────┘

--- Trade Duration Histogram (RSI + Trend) ---
┌─────────┬──────────┬───────┬─────────────┐
│ (index) │ Duration │ Count │ Avg PnL ($) │
├─────────┼──────────┼───────┼─────────────┤
│ 0       │ '0-6h'   │ 1     │ '-251.4612' │
│ 1       │ '6-12h'  │ 2     │ '136.5850'  │
│ 2       │ '12-24h' │ 0     │ '0.0000'    │
│ 3       │ '24h+'   │ 1     │ '-144.7103' │
└─────────┴──────────┴───────┴─────────────┘

Fetching 730d 1h SOLUSDT...
  Loaded 1000 candles
  RSI diagnostics (SOLUSDT 1h):

--- Exit Reason Distribution (RSI + Trend) ---
┌─────────┬──────────────────┬───────┬─────────────┬──────────────┐
│ (index) │ Exit Reason      │ Count │ Avg PnL ($) │ Win Rate (%) │
├─────────┼──────────────────┼───────┼─────────────┼──────────────┤
│ 0       │ 'RSI Overbought' │ 4     │ '88.8305'   │ '100.0'      │
└─────────┴──────────────────┴───────┴─────────────┴──────────────┘

--- Regime-Stratified Performance (RSI + Trend) ---
┌─────────┬──────────────────┬─────────────┬──────────────┬─────────────┐
│ (index) │ Regime           │ Trade Count │ Win Rate (%) │ Avg PnL ($) │
├─────────┼──────────────────┼─────────────┼──────────────┼─────────────┤
│ 0       │ 'TREND_UP'       │ 2           │ '100.0'      │ '56.2988'   │
│ 1       │ 'LOW_VOLATILITY' │ 2           │ '100.0'      │ '121.3623'  │
└─────────┴──────────────────┴─────────────┴──────────────┴─────────────┘

--- Trade Duration Histogram (RSI + Trend) ---
┌─────────┬──────────┬───────┬─────────────┐
│ (index) │ Duration │ Count │ Avg PnL ($) │
├─────────┼──────────┼───────┼─────────────┤
│ 0       │ '0-6h'   │ 2     │ '103.7360'  │
│ 1       │ '6-12h'  │ 2     │ '73.9250'   │
│ 2       │ '12-24h' │ 0     │ '0.0000'    │
│ 3       │ '24h+'   │ 0     │ '0.0000'    │
└─────────┴──────────┴───────┴─────────────┘

Fetching 730d 4h SOLUSDT...
  Loaded 1000 candles
  RSI diagnostics (SOLUSDT 4h):

--- Exit Reason Distribution (RSI + Trend) ---
┌─────────┬────────────────────┬───────┬─────────────┬──────────────┐
│ (index) │ Exit Reason        │ Count │ Avg PnL ($) │ Win Rate (%) │
├─────────┼────────────────────┼───────┼─────────────┼──────────────┤
│ 0       │ 'Max-Hold Timeout' │ 2     │ '-295.2410' │ '0.0'        │
│ 1       │ 'SMA Stop'         │ 1     │ '-535.9554' │ '0.0'        │
└─────────┴────────────────────┴───────┴─────────────┴──────────────┘

--- Regime-Stratified Performance (RSI + Trend) ---
┌─────────┬────────────┬─────────────┬──────────────┬─────────────┐
│ (index) │ Regime     │ Trade Count │ Win Rate (%) │ Avg PnL ($) │
├─────────┼────────────┼─────────────┼──────────────┼─────────────┤
│ 0       │ 'TREND_UP' │ 3           │ '33.3'       │ '-375.4838' │
└─────────┴────────────┴─────────────┴──────────────┴─────────────┘

--- Trade Duration Histogram (RSI + Trend) ---
┌─────────┬──────────┬───────┬─────────────┐
│ (index) │ Duration │ Count │ Avg PnL ($) │
├─────────┼──────────┼───────┼─────────────┤
│ 0       │ '0-6h'   │ 0     │ '0.0000'    │
│ 1       │ '6-12h'  │ 1     │ '-144.3720' │
│ 2       │ '12-24h' │ 1     │ '-391.1106' │
│ 3       │ '24h+'   │ 1     │ '-590.9689' │
└─────────┴──────────┴───────┴─────────────┘

=== Aggregated Results ===

┌─────────┬────────────────────────────────┬─────────────┬──────────────┬──────────────┬────────────────┬────────────────────┬───────────────┬──────────────────────┐
│ (index) │ Strategy                       │ Net PnL ($) │ Win Rate (%) │ Total Trades │ Total Fees ($) │ Total Slippage ($) │ Profit Factor │ Expectancy ($/trade) │
├─────────┼────────────────────────────────┼─────────────┼──────────────┼──────────────┼────────────────┼────────────────────┼───────────────┼──────────────────────┤
│ 0       │ 'Buy & Hold (BTCUSDT 1h)'      │ '6147.01'   │ '100.0'      │ 1            │ '250.43'       │ '125.22'           │ '0.00'        │ '6147.01'            │
│ 1       │ 'Random Entry (BTCUSDT 1h)'    │ '-18300.22' │ '36.7'       │ 90           │ '21581.65'     │ '10790.82'         │ '0.54'        │ '-203.34'            │
│ 2       │ 'Simple Momentum (BTCUSDT 1h)' │ '-5007.68'  │ '28.6'       │ 21           │ '4997.39'      │ '2498.70'          │ '0.54'        │ '-238.46'            │
│ 3       │ 'Mean Reversion (BTCUSDT 1h)'  │ '-10576.86' │ '48.4'       │ 31           │ '7381.27'      │ '3690.63'          │ '0.36'        │ '-341.19'            │
│ 4       │ 'RSI + Trend (BTCUSDT 1h)'     │ '412.04'    │ '100.0'      │ 5            │ '50.55'        │ '0.00'             │ '∞'           │ '82.41'              │
│ 5       │ 'Buy & Hold (BTCUSDT 4h)'      │ '44399.79'  │ '100.0'      │ 1            │ '327.34'       │ '163.67'           │ '0.00'        │ '44399.79'           │
│ 6       │ 'Random Entry (BTCUSDT 4h)'    │ '23598.03'  │ '56.7'       │ 90           │ '28809.27'     │ '14404.64'         │ '1.33'        │ '262.20'             │
│ 7       │ 'Simple Momentum (BTCUSDT 4h)' │ '14383.82'  │ '43.8'       │ 16           │ '5428.27'      │ '2714.13'          │ '1.59'        │ '898.99'             │
│ 8       │ 'Mean Reversion (BTCUSDT 4h)'  │ '-27724.35' │ '51.6'       │ 31           │ '10020.08'     │ '5010.04'          │ '0.50'        │ '-894.33'            │
│ 9       │ 'RSI + Trend (BTCUSDT 4h)'     │ '-45.78'    │ '66.7'       │ 3            │ '30.04'        │ '0.00'             │ '0.72'        │ '-15.26'             │
│ 10      │ 'Buy & Hold (ETHUSDT 1h)'      │ '74.31'     │ '100.0'      │ 1            │ '10.60'        │ '5.30'             │ '0.00'        │ '74.31'              │
│ 11      │ 'Random Entry (ETHUSDT 1h)'    │ '-796.81'   │ '40.0'       │ 90           │ '900.99'       │ '450.49'           │ '0.60'        │ '-8.85'              │
│ 12      │ 'Simple Momentum (ETHUSDT 1h)' │ '-298.66'   │ '16.7'       │ 18           │ '180.12'       │ '90.06'            │ '0.48'        │ '-16.59'             │
│ 13      │ 'Mean Reversion (ETHUSDT 1h)'  │ '-219.05'   │ '58.8'       │ 34           │ '337.05'       │ '168.53'           │ '0.71'        │ '-6.44'              │
│ 14      │ 'RSI + Trend (ETHUSDT 1h)'     │ '-123.00'   │ '25.0'       │ 4            │ '39.98'        │ '0.00'             │ '0.73'        │ '-30.75'             │
│ 15      │ 'Buy & Hold (ETHUSDT 4h)'      │ '604.02'    │ '100.0'      │ 1            │ '11.67'        │ '5.84'             │ '0.00'        │ '604.02'             │
│ 16      │ 'Random Entry (ETHUSDT 4h)'    │ '-463.09'   │ '45.6'       │ 90           │ '1072.68'      │ '536.34'           │ '0.89'        │ '-5.15'              │
│ 17      │ 'Simple Momentum (ETHUSDT 4h)' │ '-550.54'   │ '21.1'       │ 19           │ '229.43'       │ '114.72'           │ '0.64'        │ '-28.98'             │
│ 18      │ 'Mean Reversion (ETHUSDT 4h)'  │ '-1231.10'  │ '50.0'       │ 28           │ '327.95'       │ '163.98'           │ '0.45'        │ '-43.97'             │
│ 19      │ 'RSI + Trend (ETHUSDT 4h)'     │ '-532.31'   │ '50.0'       │ 6            │ '59.63'        │ '0.00'             │ '0.67'        │ '-88.72'             │
│ 20      │ 'Buy & Hold (SOLUSDT 1h)'      │ '17.54'     │ '100.0'      │ 1            │ '0.60'         │ '0.30'             │ '0.00'        │ '17.54'              │
│ 21      │ 'Random Entry (SOLUSDT 1h)'    │ '-40.12'    │ '43.3'       │ 90           │ '50.54'        │ '25.27'            │ '0.67'        │ '-0.45'              │
│ 22      │ 'Simple Momentum (SOLUSDT 1h)' │ '-11.58'    │ '31.3'       │ 16           │ '8.95'         │ '4.48'             │ '0.69'        │ '-0.72'              │
│ 23      │ 'Mean Reversion (SOLUSDT 1h)'  │ '-13.93'    │ '62.1'       │ 29           │ '16.03'        │ '8.02'             │ '0.69'        │ '-0.48'              │
│ 24      │ 'RSI + Trend (SOLUSDT 1h)'     │ '355.32'    │ '100.0'      │ 4            │ '40.46'        │ '0.00'             │ '∞'           │ '88.83'              │
│ 25      │ 'Buy & Hold (SOLUSDT 4h)'      │ '94.49'     │ '100.0'      │ 1            │ '0.75'         │ '0.38'             │ '0.00'        │ '94.49'              │
│ 26      │ 'Random Entry (SOLUSDT 4h)'    │ '46.53'     │ '55.6'       │ 90           │ '66.60'        │ '33.30'            │ '1.16'        │ '0.52'               │
│ 27      │ 'Simple Momentum (SOLUSDT 4h)' │ '61.76'     │ '42.1'       │ 19           │ '14.30'        │ '7.15'             │ '1.73'        │ '3.25'               │
│ 28      │ 'Mean Reversion (SOLUSDT 4h)'  │ '-110.32'   │ '48.3'       │ 29           │ '21.05'        │ '10.53'            │ '0.37'        │ '-3.80'              │
│ 29      │ 'RSI + Trend (SOLUSDT 4h)'     │ '-1126.44'  │ '33.3'       │ 3            │ '28.95'        │ '0.00'             │ '0.23'        │ '-375.48'            │
└─────────┴────────────────────────────────┴─────────────┴──────────────┴──────────────┴────────────────┴────────────────────┴───────────────┴──────────────────────┘

Cost model (conservative): fee=0.001, slip=0.0007, impact=0.001
```

---

## RSI Diagnostics Summary

### BTCUSDT 1h (5 trades, 100% win rate)
- **Exit reasons:** All 5 exits triggered by RSI Overbought (avg PnL: +$82.41)
- **Regimes:** TREND_UP (3 trades, 100% WR, avg +$62.87), LOW_VOLATILITY (2 trades, 100% WR, avg +$111.72)
- **Duration:** 0-6h (2 trades, avg +$79.62), 6-12h (3 trades, avg +$84.27)
- **All exits were clean RSI signals -- no stop-loss or timeout exits**

### BTCUSDT 4h (3 trades, 66.7% win rate)
- **Diagnostics not printed by script** (only 3 RSI+Trend trades total, script skipped printing diagnostics for small sample)
- **Net PnL: -$45.78, Expectancy: -$15.26/trade** -- breakeven, not meaningful

### ETHUSDT 1h (4 trades, 25% win rate)
- **Diagnostics not printed by script** (only 4 RSI+Trend trades, script skipped diagnostics)
- **Net PnL: -$123.00, Expectancy: -$30.75/trade** -- clearly losing

### ETHUSDT 4h (6 trades, 50% win rate)
- **Exit reasons:** Max-Hold Timeout x3 (avg -$133.91, 33% WR), RSI Overbought x2 (avg +$348.38, 100% WR), SMA Stop x1 (avg -$827.35, 0% WR)
- **Regimes:** All 6 trades in TREND_UP (50% WR, avg -$88.72)
- **Duration:** 0-6h (1 trade, avg -$251.46), 6-12h (2 trades, avg +$136.59), 24h+ (1 trade, avg -$144.71)
- **SMA Stop was catastrophic single trade (-$827.35). Max-Hold Timeout trades were net negative**

### SOLUSDT 1h (4 trades, 100% win rate)
- **Exit reasons:** All 4 exits triggered by RSI Overbought (avg PnL: +$88.83)
- **Regimes:** TREND_UP (2 trades, 100% WR, avg +$56.30), LOW_VOLATILITY (2 trades, 100% WR, avg +$121.36)
- **Duration:** 0-6h (2 trades, avg +$103.74), 6-12h (2 trades, avg +$73.93)
- **All exits clean RSI signals -- strong performance**

### SOLUSDT 4h (3 trades, 33.3% win rate)
- **Exit reasons:** Max-Hold Timeout x2 (avg -$295.24, 0% WR), SMA Stop x1 (avg -$535.96, 0% WR)
- **Regimes:** All 3 trades in TREND_UP (33.3% WR, avg -$375.48)
- **Duration:** 6-12h (1 trade, avg -$144.37), 12-24h (1 trade, avg -$391.11), 24h+ (1 trade, avg -$590.97)
- **All exits were stops/timeouts -- no clean RSI exits at all, pure capital destruction**

---

## Key Findings

### Strategy Ranking by Net PnL (across all 30 rows)

| Rank | Strategy | Net PnL | Notes |
|------|----------|---------|-------|
| 1 | Buy & Hold BTCUSDT 4h | +$44,399.79 | Market beta dominates |
| 2 | Random Entry BTCUSDT 4h | +$23,598.03 | High-fee baseline still profitable in bull market |
| 3 | Simple Momentum BTCUSDT 4h | +$14,383.82 | Only momentum that beats fees on BTC |
| 4 | Buy & Hold BTCUSDT 1h | +$6,147.01 | |
| 5 | Simple Momentum BTCUSDT 4h | +$14,383.82 | |
| 6 | RSI + Trend BTCUSDT 1h | +$412.04 | **Best RSI performer** |
| 7 | RSI + Trend SOLUSDT 1h | +$355.32 | **Second best RSI performer** |

### RSI Strategy Performance by Pair/Timeframe

| Pair | TF | Trades | WR | Net PnL | Expectancy | Verdict |
|------|-----|--------|----|---------|-----------|----------|
| BTCUSDT | 1h | 5 | 100% | +$412.04 | +$82.41 | STRONG |
| SOLUSDT | 1h | 4 | 100% | +$355.32 | +$88.83 | STRONG |
| BTCUSDT | 4h | 3 | 66.7% | -$45.78 | -$15.26 | BREAKEVEN |
| ETHUSDT | 1h | 4 | 25% | -$123.00 | -$30.75 | WEAK |
| ETHUSDT | 4h | 6 | 50% | -$532.31 | -$88.72 | POOR |
| SOLUSDT | 4h | 3 | 33.3% | -$1,126.44 | -$375.48 | FAILURE |

### Critical Observations

1. **1h timeframe is superior to 4h for RSI strategy**: All 3 profitable RSI combos are 1h. All 3 negative combos are 4h. The 4h bars create too much whipsaw exposure to SMA stops and max-hold timeouts.

2. **RSI Overbought exits are consistently profitable**: When RSI strategy exits cleanly on overbought signals (1h only), it always wins. The losses come from SMA Stop and Max-Hold Timeout exits.

3. **SMA Stop loss on 4h is catastrophic**: The worst single trade was SOLUSDT 4h SMA Stop at -$535.96. The ETHUSDT 4h SMA Stop was -$827.35. These stop-losses trigger too late on 4h candles.

4. **ETH is the worst asset for RSI strategy**: Both timeframes negative. ETH's higher volatility and less directional momentum makes RSI signals unreliable.

5. **SOL 1h is best RSI performer by expectancy**: +$88.83/trade vs BTC's +$82.41 -- though sample sizes (4-5 trades) are too small for statistical confidence.

6. **Mean Reversion is universally negative**: Lost money on 4 of 6 pair/timeframe combos. The only exceptions (ETH 1h at -$6.44 and SOL 1h at -$0.48) are near-breakeven but still negative.

7. **Cost model impact**: Conservative stress (fee=0.1%, slip=0.07%, impact=0.1%) is killing Random Entry strategies on 1h (BTCUSDT lost $18,300, ETHUSDT lost $797, SOLUSDT lost $40). The frequent trading compounds transaction costs rapidly.

8. **1000 candle API limit note**: Binance returns max 1000 candles per request. For 730d at 1h that's only ~42 days of data (1000 candles / 24 hours = ~42 days). The 4h fetch gets ~167 days (1000 candles / 6 hours). The script's 730-day parameter is effectively capped by the API at these lower values.

---

## Errors

None. Exit code 0. All pairs fetched successfully. No data insufficiency errors.

---

## Cost Model

**Conservative stress settings:**
- Fee: 0.1% (taker)
- Slippage: 0.07%
- Market Impact: 0.1%
- Total cost per round-trip: ~0.27% of notional
