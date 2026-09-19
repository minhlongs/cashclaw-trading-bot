---
title: "Autonomous Modularization Architecture Plan: 17 Target Files"
description: "Decomposition and modularization plan for 17 candidates (170-189 LOC) in CashClaw trade-bot"
status: pending
priority: P2
effort: 8h
branch: main
tags: [refactoring, modularization, architecture, clean-code]
created: 2026-09-18
---

# Autonomous Modularization Architecture Plan: 17 Target Files (170–189 LOC)

## Executive Summary

This architecture plan governs the modularization of 17 target files in `trade-bot` ranging between 170 and 189 lines of code (LOC). Following the established 5-phase governance pipeline (`PLAN → PLAN GATE → EXECUTE → RESULT GATE → SHIP`) and the repository's strict standard of ≤150 LOC per submodule (target ≤80 LOC), every decomposable module is refactored into single-responsibility submodules while preserving 100% backward compatibility via re-export facades.

### Summary Table of All 17 Target Files

| # | File Path | Current LOC | Decision | Rationale | Target Submodules |
|---|---|---|---|---|---|
| 1 | `src/lib/hooks/use-market-ticker.ts` | 189 | **GOOD** | Hook logic, API polling fetcher, and DTO interfaces are tightly coupled. | `use-market-ticker-types.ts`, `use-market-ticker-fetch.ts`, `use-market-ticker.ts` (facade/hook) |
| 2 | `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx` | 183 | **GOOD** | Page client mixes D1 entity types, trade event log table rendering, and bot state container. | `page-client-types.ts`, `bot-detail-events-table.tsx`, `page-client.tsx` |
| 3 | `src/components/bots/bot-detail-trades.tsx` | 181 | **GOOD** | Generic sorting table engine (`SortableTable`) embedded inside domain trade list view. | `sortable-table.tsx`, `bot-detail-trades.tsx` |
| 4 | `src/forest/alpha/multiple-testing/types.ts` | 180 | **SKIP** | Pure domain TypeScript type/interface definitions (0 runtime logic). Splitting adds import churn without architectural value. | None (retention as-is) |
| 5 | `src/components/bots/bot-detail-client.tsx` | 180 | **GOOD** | Action control button toolbar and tab models embedded in bot detail container. | `bot-detail-controls.tsx`, `bot-detail-client.tsx` |
| 6 | `src/tree/alpha/relative-value/stability.ts` | 179 | **GOOD** | Mathematical components (crossing rate, drift penalty, gate pass fraction) combined with stability coordinator. | `stability-types.ts`, `stability-components.ts`, `stability.ts` (facade/coordinator) |
| 7 | `src/app/api/tickers/route.ts` | 179 | **GOOD** | API route mixes provider singleton cache, IP parsing, Zod schemas, and HTTP route execution. | `ticker-provider-registry.ts`, `ticker-request-helpers.ts`, `route.ts` |
| 8 | `src/tree/exchange/ws/binance-ws-connection.ts` | 178 | **GOOD** | WebSocket connection class bundles stream naming, ticker/orderbook packet parsing, and socket state machine. | `binance-ws-parsers.ts`, `binance-ws-connection.ts` |
| 9 | `src/tree/alpha/relative-value/pair-selection.ts` | 178 | **GOOD** | Pair selection algorithm bundles panel validation, pair diagnostic extraction, and ranking pipeline. | `pair-selection-types.ts`, `pair-selection-helpers.ts`, `pair-selection.ts` (facade/pipeline) |
| 10 | `src/forest/alpha/pipeline/types.ts` | 178 | **SKIP** | Pure pipeline step and report type definitions (0 runtime logic). Splitting breaks cohesive pipeline type namespace. | None (retention as-is) |
| 11 | `src/tree/research/tradingagents/calibration.ts` | 177 | **GOOD** | Metric scoring math (Brier score, ECE, directional accuracy) combined with builder schema and coordinator. | `calibration-types.ts`, `calibration-metrics.ts`, `calibration.ts` (facade/builder) |
| 12 | `src/tree/exchange/paper/index.ts` | 177 | **GOOD** | Paper exchange adapter couples order execution/fill mapping, order state, and simulated market data. | `paper-types.ts`, `paper-order-helpers.ts`, `index.ts` |
| 13 | `src/forest/backtest/walkforward.ts` | 177 | **GOOD** | Slicing generator (`computeSlices`) and metric aggregation functions coupled with walkforward orchestrator. | `walkforward-types.ts`, `walkforward-slices.ts`, `walkforward.ts` (facade/runner) |
| 14 | `src/tree/alpha/microstructure/feature-computer.ts` | 176 | **GOOD** | Feature calculations split into instant orderbook/trade metrics vs lagged mid-quote metrics. | `feature-computer-instant.ts`, `feature-computer-lagged.ts`, `feature-computer.ts` (facade/coordinator) |
| 15 | `src/tree/research/alpha/zoo/operator-evaluator.ts` | 175 | **GOOD** | AST evaluation interpreter combines 17-kernel dispatch table, VWAP evaluator, and AST node visitor. | `operator-evaluator-dispatch.ts`, `operator-evaluator-ast.ts`, `operator-evaluator.ts` (facade/entry) |
| 16 | `src/tree/bot/strategies/volatility-dca.ts` | 175 | **GOOD** | Volatility math calculations and callback interfaces bundled inside stateful bot execution strategy. | `volatility-dca-math.ts`, `volatility-dca.ts` |
| 17 | `src/forest/bot/scheduler.ts` | 175 | **GOOD** | Scheduler tick loop combines D1 update persistence, exchange health telemetry logging, and eval flow. | `scheduler-types.ts`, `scheduler-helpers.ts`, `scheduler.ts` |

**Count**: 15 GOOD candidates, 2 SKIP candidates.

---

## Detailed Decomposition Blueprints (15 GOOD Candidates)

### 1. `src/lib/hooks/use-market-ticker.ts` (189 LOC)

- **Root Location**: `src/lib/hooks/`
- **Callers / References**:
  - `src/components/bots/pair-price-badge.tsx:5`
  - `src/components/bots/pair-price-badge.test.tsx:4`
  - `src/components/dashboard/market-watch-card.tsx:7`
  - `src/components/dashboard/market-watch-card.test.tsx:5`
- **Knip Note**: Facade re-exports types; no `ignoreIssues` required unless `TickerProvenance` is flagged.
- **Decomposition**:
  1. `src/lib/hooks/use-market-ticker-types.ts` (~40 LOC):
     - Extract `TickerProvenance` (`src/lib/hooks/use-market-ticker.ts:7-13`)
     - Extract `UseMarketTickerOptions` (`src/lib/hooks/use-market-ticker.ts:15-20`)
     - Extract `UseMarketTickerResult` (`src/lib/hooks/use-market-ticker.ts:22-30`)
     - Extract `TickerApiResponse` (`src/lib/hooks/use-market-ticker.ts:32-39`)
     - Extract `FetchOutcome` (`src/lib/hooks/use-market-ticker.ts:41-47`)
  2. `src/lib/hooks/use-market-ticker-fetch.ts` (~55 LOC):
     - Extract `DEFAULT_POLL_INTERVAL_MS` (`src/lib/hooks/use-market-ticker.ts:49`)
     - Extract `VALID_EXCHANGES` (`src/lib/hooks/use-market-ticker.ts:50`)
     - Extract `requestTickerData` (`src/lib/hooks/use-market-ticker.ts:52-91`)
  3. `src/lib/hooks/use-market-ticker.ts` (Facade & Hook, ~95 LOC):
     - Re-export all types from `./use-market-ticker-types`
     - Keep `useMarketTicker` implementation (`src/lib/hooks/use-market-ticker.ts:93-189`) consuming `requestTickerData` and types.

---

### 2. `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx` (183 LOC)

- **Root Location**: `src/app/[locale]/(dashboard)/bots/[id]/`
- **Callers / References**:
  - Loaded by `src/app/[locale]/(dashboard)/bots/[id]/page.tsx`
- **Knip Note**: Next.js route client component.
- **Decomposition**:
  1. `src/app/[locale]/(dashboard)/bots/[id]/page-client-types.ts` (~45 LOC):
     - Extract `BotDetailData` (`src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:7-23`)
     - Extract `ApiBotDetail` (`src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:25-45`)
     - Extract `TradeRow` (`src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:47-55`)
     - Extract `TradeEventRow` (`src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:57-62`)
  2. `src/app/[locale]/(dashboard)/bots/[id]/bot-detail-events-table.tsx` (~45 LOC):
     - Extract trade events table view (`src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:145-180`)
     - Props: `{ events: TradeEventRow[], title: string, timeHeader: string, eventTypeHeader: string, eventDetailsHeader: string }`
  3. `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx` (~95 LOC):
     - Retains page fetch effect and lifecycle states (`BotDetailPageClient`), importing the types and the events table.

---

### 3. `src/components/bots/bot-detail-trades.tsx` (181 LOC)

- **Root Location**: `src/components/bots/`
- **Callers / References**:
  - `src/components/bots/bot-detail-client.tsx:10`
- **Knip Note**: `SortableTable` is an internal helper.
- **Decomposition**:
  1. `src/components/bots/sortable-table.tsx` (~105 LOC):
     - Extract `SortDir` (`src/components/bots/bot-detail-trades.tsx:7`)
     - Extract `SortableColumn<T>` (`src/components/bots/bot-detail-trades.tsx:9-15`)
     - Extract `SortableTable<T>` component (`src/components/bots/bot-detail-trades.tsx:17-110`)
  2. `src/components/bots/bot-detail-trades.tsx` (~80 LOC):
     - Retains `BotDetailTradesProps` and `BotDetailTrades` (`src/components/bots/bot-detail-trades.tsx:112-181`), importing `SortableTable` from `./sortable-table`.

---

### 4. `src/forest/alpha/multiple-testing/types.ts` (180 LOC) — SKIP

- **Rationale**: This file is a cohesive, 100% pure TypeScript type/interface definition file containing no executable code, no functions, and no class declarations. Splitting 180 lines of interconnected types (`MultipleTestingCounters`, `CounterKnownSets`, `SurvivalVerdict`, etc.) into 2-3 artificial fragments would introduce cross-import noise without improving modularity, testability, or bundle size.

---

### 5. `src/components/bots/bot-detail-client.tsx` (180 LOC)

- **Root Location**: `src/components/bots/`
- **Callers / References**:
  - `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx:5`
- **Knip Note**: Re-exports remain compatible.
- **Decomposition**:
  1. `src/components/bots/bot-detail-controls.tsx` (~65 LOC):
     - Extract `Tab` and `ControlAction` types (`src/components/bots/bot-detail-client.tsx:13-14`)
     - Extract `TABS` array (`src/components/bots/bot-detail-client.tsx:16-20`)
     - Extract `ControlButtonProps` and `ControlButton` (`src/components/bots/bot-detail-client.tsx:22-48`)
     - Extract `BotDetailActionButtons` subcomponent rendering the row of control buttons (`src/components/bots/bot-detail-client.tsx:109-137`)
  2. `src/components/bots/bot-detail-client.tsx` (~115 LOC):
     - Keeps state management for actions, errors, and tab views, delegating controls rendering to `./bot-detail-controls`.

---

### 6. `src/tree/alpha/relative-value/stability.ts` (179 LOC)

- **Root Location**: `src/tree/alpha/relative-value/`
- **Callers / References**:
  - `src/tree/alpha/relative-value/pair-selection.ts:17`
  - `src/tree/alpha/relative-value/index.ts:45,46`
  - `src/tree/alpha/relative-value/stability.test.ts:2`
- **Knip Note**: Facade must re-export `computePairStability`, `STABILITY_REASONS`, `PairStabilityConfig`, `PairStabilityComponents`, `PairStabilityResult`. Add `"src/tree/alpha/relative-value/stability.ts": ["exports"]` to `knip.json` if needed.
- **Decomposition**:
  1. `src/tree/alpha/relative-value/stability-types.ts` (~35 LOC):
     - Extract `STABILITY_REASONS` (`src/tree/alpha/relative-value/stability.ts:26-29`)
     - Extract `PairStabilityConfig` (`src/tree/alpha/relative-value/stability.ts:32-37`)
     - Extract `PairStabilityComponents` (`src/tree/alpha/relative-value/stability.ts:40-47`)
     - Extract `PairStabilityResult` (`src/tree/alpha/relative-value/stability.ts:50-55`)
  2. `src/tree/alpha/relative-value/stability-components.ts` (~65 LOC):
     - Extract `candles` helper (`src/tree/alpha/relative-value/stability.ts:57-61`)
     - Extract `crossingRate` (`src/tree/alpha/relative-value/stability.ts:64-74`)
     - Extract `gatePassFraction` (`src/tree/alpha/relative-value/stability.ts:77-90`)
     - Extract `betaDriftPenalty` (`src/tree/alpha/relative-value/stability.ts:93-111`)
  3. `src/tree/alpha/relative-value/stability.ts` (Facade, ~80 LOC):
     - Re-export all types and `STABILITY_REASONS`
     - Keep `computePairStability` orchestrating the sub-window components.

---

### 7. `src/app/api/tickers/route.ts` (179 LOC)

- **Root Location**: `src/app/api/tickers/`
- **Callers / References**:
  - `src/lib/hooks/use-market-ticker.ts:4` (`import type { SupportedExchange }`)
  - Integration tests calling `GET` / test utilities `setDirectTickerProviderForTest`, `resetProvidersForTest`.
- **Knip Note**: Add `"src/app/api/tickers/route.ts": ["exports"]` if test helper exports trigger unused warnings.
- **Decomposition**:
  1. `src/app/api/tickers/ticker-provider-registry.ts` (~45 LOC):
     - Extract `SupportedExchange` (`src/app/api/tickers/route.ts:9`)
     - Extract `TickerQuerySchema` (`src/app/api/tickers/route.ts:11-14`)
     - Extract `providerMap`, `setDirectTickerProviderForTest`, `resetProvidersForTest`, `getProvider` (`src/app/api/tickers/route.ts:16-40`)
  2. `src/app/api/tickers/ticker-request-helpers.ts` (~30 LOC):
     - Extract `getClientIp` (`src/app/api/tickers/route.ts:42-48`)
     - Extract `parseQueryParams` (`src/app/api/tickers/route.ts:50-56`)
  3. `src/app/api/tickers/route.ts` (~105 LOC):
     - Re-exports `SupportedExchange`, `TickerQuerySchema`, test helpers.
     - Implements `GET(req: Request)`.

---

### 8. `src/tree/exchange/ws/binance-ws-connection.ts` (178 LOC)

- **Root Location**: `src/tree/exchange/ws/`
- **Callers / References**:
  - `src/tree/exchange/ws/ws-manager.ts:6`
  - `src/tree/exchange/ws/binance-ws-connection.test.ts:2`
  - `src/tree/exchange/ws/index.ts:7`
- **Knip Note**: Facade class remains identical.
- **Decomposition**:
  1. `src/tree/exchange/ws/binance-ws-parsers.ts` (~50 LOC):
     - Extract `parseTicker(data: Record<string, unknown>): Ticker` (`src/tree/exchange/ws/binance-ws-connection.ts:100-111`)
     - Extract `parseOrderBook(data: Record<string, unknown>): OrderBook` (`src/tree/exchange/ws/binance-ws-connection.ts:113-120`)
     - Extract `getBinanceStreamName(type: WsEventType, symbol: string): string` (`src/tree/exchange/ws/binance-ws-connection.ts:130-144`)
  2. `src/tree/exchange/ws/binance-ws-connection.ts` (~130 LOC):
     - Keeps `BinanceWsConnection` class, calling parser functions from `./binance-ws-parsers`.

---

### 9. `src/tree/alpha/relative-value/pair-selection.ts` (178 LOC)

- **Root Location**: `src/tree/alpha/relative-value/`
- **Callers / References**:
  - `src/tree/alpha/relative-value/index.ts:53,54`
  - `src/tree/alpha/relative-value/pair-selection.test.ts:2`
- **Knip Note**: Ensure re-exports match index.ts public interface.
- **Decomposition**:
  1. `src/tree/alpha/relative-value/pair-selection-types.ts` (~40 LOC):
     - Extract `UniversePanel` (`src/tree/alpha/relative-value/pair-selection.ts:22-27`)
     - Extract `PairSelectionConfig` (`src/tree/alpha/relative-value/pair-selection.ts:30-39`)
     - Extract `PairSelectionDiagnostics` (`src/tree/alpha/relative-value/pair-selection.ts:42-48`)
     - Extract `SelectedPair` (`src/tree/alpha/relative-value/pair-selection.ts:51-57`)
  2. `src/tree/alpha/relative-value/pair-selection-helpers.ts` (~55 LOC):
     - Extract `candles` (`src/tree/alpha/relative-value/pair-selection.ts:59-63`)
     - Extract `assertUniverse` (`src/tree/alpha/relative-value/pair-selection.ts:65-79`)
     - Extract `pairPanel` (`src/tree/alpha/relative-value/pair-selection.ts:82-90`)
     - Extract `diagnosticsFor` (`src/tree/alpha/relative-value/pair-selection.ts:92-108`)
  3. `src/tree/alpha/relative-value/pair-selection.ts` (~85 LOC):
     - Re-export all types from `./pair-selection-types`
     - Retain `selectPairs` pipeline orchestration (`src/tree/alpha/relative-value/pair-selection.ts:115-178`).

---

### 10. `src/forest/alpha/pipeline/types.ts` (178 LOC) — SKIP

- **Rationale**: Cohesive, pure TypeScript domain specification (178 LOC) declaring the pipeline step data contracts (`PipelineConfig`, `IndicatorData`, `DerivativeData`, `RegimeData`, `AlphaResearchReport`, etc.). No classes, no execution, no dependencies on Node/browser APIs. Modularization would fracture the type contracts without adding quality or maintainability.

---

### 11. `src/tree/research/tradingagents/calibration.ts` (177 LOC)

- **Root Location**: `src/tree/research/tradingagents/`
- **Callers / References**:
  - `src/tree/research/tradingagents/calibration.test.ts:14`
  - `src/tree/research/tradingagents/index.ts:13`
- **Knip Note**: Facade maintains all re-exports.
- **Decomposition**:
  1. `src/tree/research/tradingagents/calibration-types.ts` (~65 LOC):
     - Extract `CalibrationOutcome` (`src/tree/research/tradingagents/calibration.ts:13-24`)
     - Extract `CalibrationAgentKey` (`src/tree/research/tradingagents/calibration.ts:27-31`)
     - Extract `RegimeAccuracy` (`src/tree/research/tradingagents/calibration.ts:34-37`)
     - Extract `AgentCalibrationScore` (`src/tree/research/tradingagents/calibration.ts:40-54`)
     - Extract `CalibrationResult` (`src/tree/research/tradingagents/calibration.ts:57-59`)
     - Extract `calibrationOutcomeSchema` & `ECE_BINS` (`src/tree/research/tradingagents/calibration.ts:61-74`)
  2. `src/tree/research/tradingagents/calibration-metrics.ts` (~45 LOC):
     - Extract `isDirectionCorrect` (`src/tree/research/tradingagents/calibration.ts:77-81`)
     - Extract `computeBrierScore` (`src/tree/research/tradingagents/calibration.ts:84-91`)
     - Extract `computeCalibrationError` (`src/tree/research/tradingagents/calibration.ts:94-114`)
  3. `src/tree/research/tradingagents/calibration.ts` (~65 LOC):
     - Re-export all types and metric helpers
     - Retain `buildAgentCalibrationScore` (`src/tree/research/tradingagents/calibration.ts:120-177`).

---

### 12. `src/tree/exchange/paper/index.ts` (177 LOC)

- **Root Location**: `src/tree/exchange/paper/`
- **Callers / References**:
  - `src/tree/exchange/paper/index.ts` exported via `src/tree/exchange/index.ts` or directly
- **Knip Note**: Re-exports all types and `PaperExchange`.
- **Decomposition**:
  1. `src/tree/exchange/paper/paper-types.ts` (~35 LOC):
     - Extract `MarketDataFetcher` (`src/tree/exchange/paper/index.ts:18`)
     - Extract `PaperExchangeOptions` (`src/tree/exchange/paper/index.ts:20-22`)
     - Extract `PaperTrade` (`src/tree/exchange/paper/index.ts:24-36`)
  2. `src/tree/exchange/paper/paper-order-helpers.ts` (~40 LOC):
     - Extract `createPaperTrade(counter: number, exchangeId: ExchangeId, request: OrderRequest): PaperTrade`
     - Extract `mapTradeToOrderResult(trade: PaperTrade): OrderResult` (`src/tree/exchange/paper/index.ts:162-176`)
  3. `src/tree/exchange/paper/index.ts` (~105 LOC):
     - Re-export types from `./paper-types`
     - Implement `PaperExchange` state management and public API methods.

---

### 13. `src/forest/backtest/walkforward.ts` (177 LOC)

- **Root Location**: `src/forest/backtest/`
- **Callers / References**:
  - Extensively imported across alpha research: `src/forest/research/zoo-falsification/verdict.ts`, `wf-shim.ts`, `relative-value-eval/survival-shim.ts`, `ablation.ts`, `walk-forward/driver.ts`, `composition-eval/walk-forward.ts`, `multiple-testing/walk-forward-consistency.ts`, `multiple-testing/types.ts`, etc.
- **Knip Note**: Facade must re-export `computeSlices`, `runWalkForward`, and all types.
- **Decomposition**:
  1. `src/forest/backtest/walkforward-types.ts` (~50 LOC):
     - Extract `WindowConfig` (`src/forest/backtest/walkforward.ts:10-15`)
     - Extract `WindowMode` (`src/forest/backtest/walkforward.ts:17`)
     - Extract `WalkForwardWindow` (`src/forest/backtest/walkforward.ts:19-30`)
     - Extract `SummaryStats` (`src/forest/backtest/walkforward.ts:32-38`)
     - Extract `AggregatedMetrics` (`src/forest/backtest/walkforward.ts:41`)
     - Extract `WalkForwardResult` (`src/forest/backtest/walkforward.ts:43-52`)
     - Extract `RunBacktestFn`, `DetectRegimeFn` (`src/forest/backtest/walkforward.ts:55-58`)
     - Extract `WindowSlice` (`src/forest/backtest/walkforward.ts:89-96`)
  2. `src/forest/backtest/walkforward-slices.ts` (~65 LOC):
     - Extract `averageResults` (`src/forest/backtest/walkforward.ts:62-87`)
     - Extract `computeSlices` (`src/forest/backtest/walkforward.ts:99-120`)
  3. `src/forest/backtest/walkforward.ts` (~65 LOC):
     - Re-export all types and `computeSlices`
     - Retain `runWalkForward` orchestrator (`src/forest/backtest/walkforward.ts:124-177`).

---

### 14. `src/tree/alpha/microstructure/feature-computer.ts` (176 LOC)

- **Root Location**: `src/tree/alpha/microstructure/`
- **Callers / References**:
  - `src/tree/alpha/microstructure/index.ts:30`
  - `src/tree/alpha/microstructure/feature-computer.test.ts:8`
  - `src/tree/alpha/microstructure/feature-computer-lagged.test.ts:6`
  - `src/tree/alpha/microstructure/feature-computer-leakage.test.ts:12`
- **Knip Note**: Facade exports `computeFeatureVectors`.
- **Decomposition**:
  1. `src/tree/alpha/microstructure/feature-computer-instant.ts` (~65 LOC):
     - Extract `computeOrderbookFeatures` (`src/tree/alpha/microstructure/feature-computer.ts:23-55`)
     - Extract `computeTradeFeatures` (`src/tree/alpha/microstructure/feature-computer.ts:57-74`)
     - Extract `computeLiquidityShock` (`src/tree/alpha/microstructure/feature-computer.ts:77-87`)
  2. `src/tree/alpha/microstructure/feature-computer-lagged.ts` (~35 LOC):
     - Extract `computeLaggedFeatures` (`src/tree/alpha/microstructure/feature-computer.ts:90-116`)
  3. `src/tree/alpha/microstructure/feature-computer.ts` (~75 LOC):
     - Retain `computeOne` and `computeFeatureVectors` (`src/tree/alpha/microstructure/feature-computer.ts:118-176`).

---

### 15. `src/tree/research/alpha/zoo/operator-evaluator.ts` (175 LOC)

- **Root Location**: `src/tree/research/alpha/zoo/`
- **Callers / References**:
  - `src/tree/research/alpha/zoo/operator-evaluator.test.ts:8`
  - `src/tree/research/alpha/zoo/index.ts`
- **Knip Note**: Facade exports `evaluateFormula`, `SymbolPanel`, `EvalResult`.
- **Decomposition**:
  1. `src/tree/research/alpha/zoo/operator-evaluator-dispatch.ts` (~70 LOC):
     - Extract `param` (`src/tree/research/alpha/zoo/operator-evaluator.ts:103-109`)
     - Extract `Kernel` type (`src/tree/research/alpha/zoo/operator-evaluator.ts:111`)
     - Extract `DISPATCH` table (`src/tree/research/alpha/zoo/operator-evaluator.ts:115-132`)
     - Extract `evalVwap` and `safeDivMatrix` (`src/tree/research/alpha/zoo/operator-evaluator.ts:134-140, 150-157`)
     - Extract `dispatchCall` (`src/tree/research/alpha/zoo/operator-evaluator.ts:142-148`)
  2. `src/tree/research/alpha/zoo/operator-evaluator-ast.ts` (~60 LOC):
     - Extract `lagSeries` (`src/tree/research/alpha/zoo/operator-evaluator.ts:61-65`)
     - Extract `map2` (`src/tree/research/alpha/zoo/operator-evaluator.ts:67-73`)
     - Extract `evalNode` (`src/tree/research/alpha/zoo/operator-evaluator.ts:75-101`)
  3. `src/tree/research/alpha/zoo/operator-evaluator.ts` (~50 LOC):
     - Retain `SymbolPanel`, `EvalResult`, `panelLength`, `validatePanel`, `sanitize`, and `evaluateFormula` (`src/tree/research/alpha/zoo/operator-evaluator.ts:32-60, 160-175`).

---

### 16. `src/tree/bot/strategies/volatility-dca.ts` (175 LOC)

- **Root Location**: `src/tree/bot/strategies/`
- **Callers / References**:
  - `src/forest/backtest/engine.ts:8`
  - `src/forest/backtest/paper-exchange.ts:8`
  - `src/tree/bot/strategies/volatility-dca.test.ts:2`
  - `src/tree/bot/strategies/volatility-dca-orders.test.ts:2`
- **Knip Note**: Re-export `VolatilityDcaCallbacks` and `VolatilityDcaStrategy`.
- **Decomposition**:
  1. `src/tree/bot/strategies/volatility-dca-math.ts` (~35 LOC):
     - Extract `computeAnnualizedVol(prices: number[]): number` (`src/tree/bot/strategies/volatility-dca.ts:15-24`)
     - Extract `VolatilityDcaCallbacks` interface (`src/tree/bot/strategies/volatility-dca.ts:8-12`)
  2. `src/tree/bot/strategies/volatility-dca.ts` (~140 LOC):
     - Re-export `VolatilityDcaCallbacks` and `computeAnnualizedVol`
     - Retain `VolatilityDcaStrategy` class (`src/tree/bot/strategies/volatility-dca.ts:26-175`).

---

### 17. `src/forest/bot/scheduler.ts` (175 LOC)

- **Root Location**: `src/forest/bot/`
- **Callers / References**:
  - `src/worker-api.ts:14`
  - `src/forest/bot/scheduler.test.ts:111`
  - `src/worker.test.ts:27`
  - `src/worker-extended.test.ts:16`
- **Knip Note**: Re-export `BotScheduler`, `SchedulerDeps`, `SchedulerTickReport`, `SchedulerError`.
- **Decomposition**:
  1. `src/forest/bot/scheduler-types.ts` (~30 LOC):
     - Extract `SchedulerDeps` (`src/forest/bot/scheduler.ts:14-19`)
     - Extract `SchedulerTickReport` (`src/forest/bot/scheduler.ts:164-170`)
     - Extract `SchedulerError` (`src/forest/bot/scheduler.ts:172-175`)
  2. `src/forest/bot/scheduler-helpers.ts` (~55 LOC):
     - Extract `emitExchangeHealthSnapshots` (`src/forest/bot/scheduler.ts:124-144`)
     - Extract `persistBotState` (`src/forest/bot/scheduler.ts:147-161`)
  3. `src/forest/bot/scheduler.ts` (~100 LOC):
     - Re-export all types from `./scheduler-types`
     - Retain `BotScheduler` class and eval loop (`src/forest/bot/scheduler.ts:21-122`).

---

## Batch Execution Plan (Parallel Groups & Dependencies)

To respect the rule that **no two parallel tasks may touch the same file or have unstated dependencies**, the 15 candidate refactorings are organized into three sequential batches:

### Batch 1: Frontend & UI Layer (5 files)
*Parallelizable across subagents (completely disjoint file trees)*
1. `src/lib/hooks/use-market-ticker.ts`
2. `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx`
3. `src/components/bots/bot-detail-trades.tsx`
4. `src/components/bots/bot-detail-client.tsx`
5. `src/app/api/tickers/route.ts`

### Batch 2: Core Tree Layer: Exchange & Research (5 files)
*Parallelizable across subagents (independent subsystem modules)*
6. `src/tree/exchange/ws/binance-ws-connection.ts`
7. `src/tree/exchange/paper/index.ts`
8. `src/tree/alpha/microstructure/feature-computer.ts`
9. `src/tree/research/alpha/zoo/operator-evaluator.ts`
10. `src/tree/research/tradingagents/calibration.ts`

### Batch 3: Algorithms, Backtest & Bot Orchestration (5 files)
*Ordered sequence to respect dependency: stability before pair-selection*
11. `src/tree/alpha/relative-value/stability.ts`
12. `src/tree/alpha/relative-value/pair-selection.ts` (depends on stability.ts types)
13. `src/forest/backtest/walkforward.ts`
14. `src/tree/bot/strategies/volatility-dca.ts`
15. `src/forest/bot/scheduler.ts`

---

## Behavioral Checklist & System Invariants

- [x] **Explicit data flows documented**:
  - Each extracted helper receives inputs via typed parameters and returns values without side-effects or ambient state.
  - Component props interfaces match prior signatures byte-for-byte.
- [x] **Dependency graph complete**:
  - Relative-value: `pair-selection.ts` imports from `stability.ts`; `stability.ts` is modularized first.
  - No cyclic imports between submodules and facades.
- [x] **Risk assessed per phase**:
  - *Risk*: Knip flags facade re-exports as unused. *Mitigation*: Add specific facade entries to `ignoreIssues` in `knip.json`.
  - *Risk*: Next.js Turbopack client component compilation break. *Mitigation*: Run `npm run build` after Batch 1.
- [x] **Backwards compatibility strategy stated**:
  - 100% re-export facades on existing file paths. Zero breaking changes to import paths for external consumers.
- [x] **Test matrix defined**:
  - Targeted unit tests run after each file.
  - Full suite (4,134 tests across 333 files) run after each batch.
  - Knip check (`npm run knip` or `npx knip`) run to verify export hygiene.
  - Turbopack build (`npm run build`) run to verify edge bundling.
- [x] **Rollback plan exists**:
  - `git checkout -- <file>` reverts individual modularizations immediately with zero cascading damage.
- [x] **File ownership assigned**:
  - Batches and subtasks have strictly isolated file paths.
- [x] **Success criteria measurable**:
  - 0 TypeScript compiler errors (`npx tsc --noEmit`).
  - 0 ESLint warnings (`npm run lint`).
  - 0 Knip unused export issues (`npx knip`).
  - 4,134 / 4,134 unit and integration tests passing (`npm test`).
  - Turbopack production build exit code 0 (`npm run build`).

---

## Ship & Deployment Plan

1. **Verification Gate**:
   - `npx tsc --noEmit`
   - `npm test` (all 4,134 tests pass)
   - `npx knip` (0 issues)
   - `npm run build` (Turbopack exit 0)
2. **Git Commit & Push**:
   - Commit message: `refactor: modularize 15 candidates across frontend, tree, and forest layers`
   - Push to `origin/main`
3. **Cloudflare Workers Deployment**:
   - Deploy to Cloudflare Workers edge runtime (`npx wrangler deploy` / CI action)
4. **Smoke Verification**:
   - Ping live edge endpoint: `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev/api/health`
   - Verify SHA pin in response.

---

## Unresolved Questions

- None. All file paths, dependencies, and symbols have been verified against the current repository state.
