---
name: project_direct_ticker_provider_shipped
description: 2026-09-12 DirectTickerProvider and PaperExchange market data integration shipped
metadata:
  type: project
---

Unified DirectTickerProvider and PaperExchange integration shipped on 2026-09-12 at `.orchestrate/latest/execution.md`.

**Why:**
Direct REST clients for Binance, OKX, and Bybit existed as isolated components with heterogeneous formats and symbols, while PaperExchange used dummy zeroed tickers.

**Shipped Architecture:**
1. Bidirectional `SymbolNormalizer` (`BTC/USDT` <-> `BTCUSDT`/`BTC-USDT`) with support for common quotes (`USDT`, `USDC`, `FDUSD`, etc.) and delimiters (`/`, `-`, `_`).
2. `TickerNormalizer` mapping heterogeneous exchange payloads (`Binance24hrTicker`, `OkxTicker`, `BybitTicker`) to CashClaw `Ticker` domain interface with fail-closed positive finite number validation.
3. `DirectTickerProvider` implementing standard `TickerProvider` with `CircuitBreaker` FSM and `healthCheck()` via `client.ping()`.
4. Injected optional market data fetcher into `PaperExchange` with graceful fallback to simulated ticker.
5. Strict ADR-001 paper-only invariant preserved (zero live order surface).
6. 100.00% coverage floor maintained on `src/tree/exchange/direct/**`.
7. All 14 files strictly $\le 200$ LOC (including `paper-provider.ts` pruned from 203 to 158 LOC).
8. 4,012/4,012 tests passing across 315 test files.
