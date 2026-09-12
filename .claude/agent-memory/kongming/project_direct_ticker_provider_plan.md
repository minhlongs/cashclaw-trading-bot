---
name: project_direct_ticker_provider_plan
description: 2026-09-12 plan for DirectTickerProvider and PaperExchange market data integration
metadata:
  type: project
---

Unified DirectTickerProvider and PaperExchange integration planned on 2026-09-12 at `.orchestrate/latest/plan.md`.

**Why:**
Direct REST clients for Binance, OKX, and Bybit existed as isolated components with heterogeneous formats and symbols, while PaperExchange used dummy zeroed tickers.

**How to apply:**
1. Bidirectional `SymbolNormalizer` (`BTC/USDT` <-> `BTCUSDT`/`BTC-USDT`).
2. `TickerNormalizer` mapping exchange responses to CashClaw `Ticker` domain interface with fail-closed validation.
3. `DirectTickerProvider` implementing `TickerProvider` with `CircuitBreaker` FSM and `healthCheck()`.
4. Injected optional market data fetcher into `PaperExchange` with graceful fallback to simulated ticker.
5. Strict ADR-001 paper-only invariant preserved (zero live orders).
6. 100.00% coverage floor on `src/tree/exchange/direct/**` and all files $\le 200$ LOC (including pruning `paper-provider.ts` from 203 to $< 190$ LOC).
