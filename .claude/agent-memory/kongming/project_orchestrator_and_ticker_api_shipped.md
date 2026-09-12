---
name: Orchestrator Live Tickers & Market Data API Route Shipped
description: 2026-09-12 ExchangeOrchestrator and PaperAdapter wired to DirectTickerProvider, /api/tickers shipped
---

Wired ExchangeOrchestrator and Bot Paper-Adapter to DirectTickerProvider, shipped edge-native `/api/tickers` route on 2026-09-12 at `.orchestrate/latest/execution.md`.

Key Components:
1. `src/tree/bot/paper-adapter.ts` (96 LOC): `PaperAdapterOptions` with `tickerFetcher?: (symbol: string) => Promise<Ticker>`. Graceful simulated fallback on fetch failure.
2. `src/land/exchange-orchestration/provider-factory.ts` (39 LOC): `isSupportedDirectExchange` and `createDefaultPaperExchangeProvider` auto-wiring `DirectTickerProvider` for binance/okx/bybit.
3. `src/land/exchange-orchestration/index.ts` (171 LOC): Pruned from 200 to 171 LOC using `safeExecute` helper, supporting `directTickerProviders` DI.
4. `src/app/api/tickers/route.ts` (164 LOC): Edge-native GET route with Zod query validation, 60 req/min sliding-window rate limit, and rich provenance metadata.
5. Preserved ADR-001 paper-only invariant (zero live order surface). 4,038/4,038 tests passing (100%), all files <= 200 LOC, 0 `:any` types.
