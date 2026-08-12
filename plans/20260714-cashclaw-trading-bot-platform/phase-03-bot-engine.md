---
phase: 3
title: "Bot Engine — Grid + Mean Reversion"
status: complete
priority: P1
effort: 3d
dependencies: [phase-01, phase-02]
---

# Phase 3: Bot Engine

## Overview
Core trading logic: Grid and Mean Reversion strategies. Each bot runs on a 1-min Cron trigger, evaluates market conditions, and decides entry/exit. Paper mode simulates fills; live mode places real orders.

## Requirements
- Functional: Grid bot (multi-level limit orders), Mean Reversion bot (BB + RSI), position sizing, stop-loss, P&L tracking, killswitch.
- Non-functional: Strategy eval < 100ms per bot, memory < 50MB per invocation, zero orphaned positions.

## Architecture
```
src/tree/strategy/
  base.ts                 # Abstract base: evaluate(), onFill(), onCancel()
  grid/
    engine.ts             # Grid: place limit orders at N levels around current price
    config.ts             # Grid params: spacing, levels, capital/level
  mean-reversion/
    engine.ts             # Mean Rev: BB band check + RSI filter
    config.ts             # MR params: BB period, RSI thresholds

src/forest/bot/
  scheduler.ts            # Maps bots → Cron triggers
  executor.ts             # Per-bot eval loop: fetch data → run strategy → act
  killswitch.ts           # Emergency stop: pauses ALL bots, cancels open orders
  state.ts                # Bot state machine (draft → paper_test → live → paused → error)

src/forest/bot/types.ts     # BotConfig, TradeSignal, BotState
```

## Grid Strategy
```
Current price: $50,000 BTC
Grid spacing: 0.5% (10 levels each side)
Capital: $1000, 5% per level = $50/order

BUY levels:  $49,750 | $49,500 | $49,250 | $49,000 | $48,750
SELL levels: $50,250 | $50,500 | $50,750 | $51,000 | $51,250

When BUY fills → place SELL at +1 level
When SELL fills → place BUY at -1 level
Range exhaustion → pause bot, alert user
```

## Mean Reversion Strategy
```
Entry conditions (ALL must be true):
1. Price < Bollinger lower band (20-period, 2σ)
2. RSI(14) < 30 (oversold)
3. Volume > 1.5× average (confirmation)

Exit conditions (ANY):
1. Price crosses BB middle band
2. RSI > 50
3. Hard stop-loss at 2× BB width from entry

Position sizing: 10% of allocated capital per trade
```

## Bot State Machine
```
draft → paper_test → live_running → paused → live_running
                         → error    → paused
                         → stopped  (terminal)
```

## Killswitch
```
Trigger: ANY of:
- User clicks "Emergency Stop" in dashboard
- Max drawdown > 20% (configurable)
- Exchange API returns 5xx / connection lost > 5 min
- Manual trigger via Telegram /campaign command

Action:
1. Set all bots to 'paused'
2. Cancel all open orders via exchange API
3. Log event to audit_log
4. Send alert to user (Telegram/email)
```

## Implementation Steps
1. Define bot config schema (GridConfig, MeanRevConfig) as TypeScript interfaces.
2. Build `BotExecutor`: fetch latest candle from price feed → run strategy engine → generate TradeSignal.
3. Grid engine: calculate levels from config, check if any level hit, place/monitor limit orders.
4. Mean Reversion engine: compute BB + RSI from OHLCV, evaluate entry/exit conditions.
5. Paper adapter: simulate fills at next candle open, update bot state in D1.
6. Live adapter: place real orders via exchange REST, track via WS fills.
7. Cron trigger: 1 bot = 1 Cron job. Map bot IDs to Cron schedules in wrangler.jsonc.
8. Killswitch: WS endpoint + D1 flag check at start of each eval cycle.
9. D1 writes: batch insert trades (500-row chunks), optimistic locking on bot state.

## D1 Interaction (per eval cycle)
```
1. SELECT * FROM bots WHERE status = 'live_running' AND next_eval_at <= now
2. FOR each bot:
   a. Fetch price data from WS cache
   b. Run strategy engine
   c. IF signal generated → execute (paper or live)
   d. UPDATE bots SET total_pnl=..., updated_at=...
   e. INSERT INTO trades (...)
3. Batch commit all writes in single D1 transaction
```

## Success Criteria
- [ ] Grid bot places 5 buy + 5 sell limit orders on Binance testnet
- [ ] Grid bot re-positions orders when a level fills (paper mode)
- [ ] Mean Rev bot enters position when BB + RSI conditions met (backtested signal)
- [ ] Killswitch pauses all bots + cancels orders within 10s
- [ ] Max drawdown alert triggers at configurable threshold
- [ ] Trade history visible in D1 with correct P&L

## Risk Assessment
- **Risk:** Cron drift causes missed entries. **Mitigation:** next_eval_at field + drift tolerance ±30s.
- **Risk:** D1 single-thread contention with 3 bots × 1-min cron. **Mitigation:** 30s offset per bot user (user A: :00, user B: :30).
- **Risk:** Grid death spiral in strong downtrend. **Mitigation:** Hard stop at max drawdown %, killswitch mandatory.
