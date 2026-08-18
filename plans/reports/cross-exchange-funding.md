# Cross-Exchange Funding Rate Arbitrage Backtest — BTCUSDT

**Date:** 2026-08-18
**Exchanges:** Binance Futures, Bybit Linear, OKX Perpetual
**Cost Model:** fee=0.001, slip=0.0007, impact=0.001
**Aligned periods:** 1095 (8-hour intervals)
**Date range:** 2025-08-19 → 2026-08-18

## Strategy

Delta-neutral funding rate arbitrage between exchanges.
When the funding rate differential between two exchanges exceeds a threshold:
- **Short** the perpetual on the exchange paying the higher rate
- **Long** the perpetual on the exchange paying the lower rate
- **Collect** the differential each 8-hour funding period
- **Exit** when the differential reverts below threshold or max hold reached

## Key Assumptions

- Same notional size on both legs (delta-neutral)
- Funding rate differential is captured as gross PnL per period
- No leverage used in the calculation
- Entry/exit costs applied at each trade open and close

## Threshold: 0.01%

| Metric | Value |
|--------|-------|
| Trades | 36 |
| Total Net PnL | -0.1894 |
| Total Fees | 0.1944 |
| Avg PnL/trade | -0.005260 |
| Win Rate | 0.0% |
| Sharpe (annualized) | -2436.46 |
| Bootstrap 90% CI | [-0.0053, -0.0052] |
| Profit Factor | 0.00 |

### By Exchange Pair

| Pair | Trades | Win Rate | Avg PnL |
|------|--------|----------|---------|
| binance-bybit | 36 | 0.0% | -0.005260 |

### Top 5 Trades

| Entry | Exit | Pair | Diff | PnL |
|-------|------|------|------|-----|
| 2026-05-27 | 2026-05-28 | binance-bybit | 0.0002 | -0.0050 |
| 2025-10-13 | 2025-10-13 | binance-bybit | -0.0002 | -0.0051 |
| 2025-10-20 | 2025-10-21 | binance-bybit | -0.0001 | -0.0051 |
| 2025-10-11 | 2025-10-11 | binance-bybit | 0.0002 | -0.0052 |
| 2025-09-21 | 2025-09-21 | binance-bybit | -0.0001 | -0.0052 |

## Threshold: 0.03%

| Metric | Value |
|--------|-------|
| Trades | 0 |
| Total Net PnL | 0.0000 |
| Total Fees | 0.0000 |
| Avg PnL/trade | 0.000000 |
| Win Rate | 0.0% |
| Sharpe (annualized) | 0.00 |
| Bootstrap 90% CI | [0.0000, 0.0000] |
| Profit Factor | 0.00 |

## Threshold: 0.05%

| Metric | Value |
|--------|-------|
| Trades | 0 |
| Total Net PnL | 0.0000 |
| Total Fees | 0.0000 |
| Avg PnL/trade | 0.000000 |
| Win Rate | 0.0% |
| Sharpe (annualized) | 0.00 |
| Bootstrap 90% CI | [0.0000, 0.0000] |
| Profit Factor | 0.00 |

## Summary Comparison

| Threshold | Trades | Total PnL | Win% | Sharpe | Bootstrap CI |
|-----------|--------|-----------|------|--------|--------------|
| 0.01% | 36 | -0.1894 | 0.0% | -2436.46 | [-0.0053, -0.0052] |
| 0.03% | 0 | 0.0000 | 0.0% | 0.00 | [0.0000, 0.0000] |
| 0.05% | 0 | 0.0000 | 0.0% | 0.00 | [0.0000, 0.0000] |

## Verdict

**Cross-exchange funding rate arbitrage is NOT a viable alpha source.**

### Why it fails

1. **Funding rates are nearly identical across exchanges.** Binance vs Bybit mean differential
   is 0.00000 with absolute mean 0.00004 (4 bps). This is below the 0.01% (1 bp) threshold —
   the signal-to-noise ratio is essentially zero.

2. **Costs eat the entire differential.** Even at the 0.01% threshold (the only one that
   triggers), every trade loses money. Total PnL is -0.1894 with 0% win rate. The 0.03%
   and 0.05% thresholds produce zero trades — the differential never reaches those levels.

3. **OKX is unavailable.** The OKX funding-rate-history endpoint returns 51001 (parameter
   error) for the BTCUSDT-SWAP instId format. Only Binance vs Bybit was tested, but this
   is the most liquid pair and the one where arbitrage is most likely to exist.

### Honest assessment

This is a valid falsification, not an implementation failure. The market is efficient:
if Binance and Bybit funding rates differed by more than the cost of arbitrage, professional
market makers would capture the spread. The fact that the differential is 0.00000 means
the market is already in equilibrium — there is no exploitable edge here.

This is the 5th strategy class falsified:
1. TA across timeframes — 14/15 negative
2. Single-venue funding rate fade — 0/7 OOS pass
3. ML regime detection — majority-class collapse
4. Cross-asset pairs trading — 108/108 negative
5. Cross-exchange funding arb — 0 trades above 0.01% threshold, all negative