# Cross-Exchange Funding Rate Arbitrage Backtest

**Date:** 2026-08-16
**Script:** `src/forest/backtest/cross-exchange-funding.ts`
**Exchanges:** Binance Futures, Bybit Linear, OKX Perpetual
**Assets:** BTCUSDT, ETHUSDT, SOLUSDT
**Cost Model:** fee=0.001, slip=0.0007, impact=0.001 (conservative)

## Status: Script Complete — Live Data Fetch Requires Network

The backtest script is implemented and type-checks clean. It is ready to run
when network access is available.

### Run Command

```bash
npx tsx src/forest/backtest/cross-exchange-funding.ts [days]
```

Default: 365 days. Example: `npx tsx src/forest/backtest/cross-exchange-funding.ts 730`

### Script Architecture

1. **Data Fetching** — Three fetchers (Binance, Bybit, OKX) for funding rate
   history. All use public endpoints with no authentication required.
   - Binance: `fapi.binance.com/fapi/v1/fundingRate` (paginated, 1000/limit)
   - Bybit: `api.bybit.com/v5/market/funding/history` (paginated, 200/limit)
   - OKX: `www.okx.com/api/v5/public/funding-rate-history` (paginated via `after` cursor, 100/limit)

2. **Data Alignment** — Funds rates are aligned into 8-hour bins using
   the most recent rate from each exchange within each bin. This handles
   the fact that exchanges publish at slightly different times.

3. **Backtest Engine** — For each exchange pair (Binance-Bybit, Binance-OKX,
   Bybit-OKX) and each threshold (0.0001, 0.0003, 0.0005):
   - When `|rateA - rateB| >= threshold`, enter a delta-neutral position:
     short the higher-rate exchange, long the lower-rate exchange
   - Collect the differential each 8-hour period as gross PnL
   - Exit when differential reverts below threshold, or after 10 periods max

4. **Statistics** — PnL, Sharpe (annualized), bootstrap 90% CI, win rate,
   profit factor, trades count. All costs applied at entry and exit.

5. **Report Generation** — Markdown report written to
   `plans/reports/cross-exchange-funding.md` with per-threshold tables,
   per-pair breakdown, top trades, and a verdict.

### Key Assumptions

- Same notional size on both legs (delta-neutral)
- Funding rate differential is captured as gross PnL per period
- No leverage used in the calculation
- Entry/exit costs applied at each trade open and close
- Conservative cost model: fee=0.001, slip=0.0007, impact=0.001

### Expected Results (to be filled after live run)

The script will produce results for 3 thresholds:
- 0.0001 (10 bps) — likely many trades, marginal profitability
- 0.0003 (30 bps) — fewer trades, higher per-trade profit
- 0.0005 (50 bps) — fewest trades, largest per-trade profit

### Honest Assessment

Funding rate arbitrage is a well-known strategy. The key question is whether
the differential persists long enough after costs to be tradeable. The
bootstrap CI will tell us if any observed Sharpe is statistically significant
or just noise from a small sample.

If the signal fails (negative or zero Sharpe after costs), that is the honest
result — not all academic signals survive real-world constraints.