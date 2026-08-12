---
phase: 5
title: "Backtesting — Jesse → D1 Pipeline"
status: pending
priority: P2
effort: 2d
dependencies: [phase-02]
---

# Phase 5: Backtesting

## Overview
Local backtesting pipeline using Jesse framework. Import historical OHLCV via CCXT, run strategy simulation, export results to D1 for dashboard display.

## Requirements
- Functional: Download 6mo historical data per pair, run Grid/MeanRev simulation, compute P&L + drawdown + win rate, export to D1.
- Non-functional: Backtest 1 pair in <5min locally, results loadable in dashboard <3s.

## Architecture
```
backtests/
  strategies/
    grid-strategy.py        # Jesse strategy: Grid
    mean-rev-strategy.py    # Jesse strategy: Mean Reversion
  scripts/
    download-data.py        # CCXT → CSV per pair/timeframe
    run-backtest.py         # Jesse CLI runner, exports JSON
    import-to-d1.py         # JSON → D1 backtest_results table

D1 table: backtest_results
  id, bot_id (nullable), strategy, pair, exchange,
  start_date, end_date,
  total_trades, win_rate, total_pnl, max_drawdown,
  sharpe_ratio,
  params_json,              # Exact strategy params used
  created_at
```

## Jesse Integration
```python
import ccxt
import jesse

# Download: BTC/USDT daily candles, 6 months
exchange = ccxt.binance()
ohlcv = exchange.fetch_ohlcv('BTC/USDT', '1d', since=timestamp_6mo_ago)
# → save to backtests/data/BTC-USDT-1d.csv

# Jesse strategy run
# jesse make --strategy GridStrategy --data BTC-USDT-1d.csv
# → outputs: backtests/results/grid-2026-07-14.json
```

## Implementation Steps
1. Set up Jesse in `backtests/` venv (Python 3.11+, separate from Node workspace).
2. Write data downloader: CCXT → CSV for BTC, ETH, SOL pairs (1h + 4h + 1d timeframes).
3. Implement Grid strategy in Jesse: match exact logic from Phase 3 engine.
4. Implement Mean Reversion strategy: BB + RSI, match Phase 3 engine.
5. Build exports: JSON results → D1 via `wrangler d1 execute` (or HTTP endpoint).
6. Dashboard integration: show backtest equity curve + metrics on Bot Detail page.

## Success Criteria
- [ ] Backtest data: 6mo OHLCV for BTC/USDT, ETH/USDT, SOL/USDT on Binance
- [ ] Grid strategy backtest shows realistic P&L (not perfect — must have drawdown)
- [ ] Results importable to D1 and visible in dashboard
- [ ] Can run backtest end-to-end: download → simulate → import → view

## Risk Assessment
- **Risk:** Jesse version compatibility (Python 3.11 vs 3.12). **Mitigation:** Pin to Jesse 1.x + Python 3.11, document in backtests/README.md.
- **Risk:** Backtest overfitting. **Mitigation:** Require minimum 200 trades, show out-of-sample validation.
- **Risk:** D1 import path needs running Workers. **Mitigation:** Use `wrangler d1 execute` CLI or local dev server.
