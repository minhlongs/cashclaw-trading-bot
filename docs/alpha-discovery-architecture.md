# Alpha Discovery Architecture

> Technical architecture reference for the Alpha Discovery Engine.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Layers](#architecture-layers)
3. [Data Flow](#data-flow)
4. [Component Map](#component-map)
5. [Regime System](#regime-system)
6. [Walk-Forward Validation](#walk-forward-validation)
7. [Cost Model](#cost-model)
8. [Portfolio Optimization](#portfolio-optimization)
9. [Execution Layer](#execution-layer)
10. [Testing Strategy](#testing-strategy)
11. [Safety Constraints](#safety-constraints)
12. [Module Sizes](#module-sizes)

---

## 1. Overview

The Alpha Discovery Engine is a quantitative research framework for generating, evaluating, and stress-testing trading signals. It operates exclusively in paper-trading and backtesting modes -- no live orders are ever placed.

The engine follows a **Tree-Forest** architecture. The **Tree layer** contains individual alpha building blocks: pure indicator functions, signal combiners, triple-barrier labeling, regime classification, factor analysis, correlation analysis, and portfolio optimization. Each tree module is a standalone, deterministic, side-effect-free component. The **Forest layer** orchestrates these blocks into end-to-end workflows: walk-forward backtesting, cost-model stress testing, attribution analysis, baseline comparison, evaluation reporting, dashboard state management, and paper-trading execution. A top-level pipeline engine (`PipelineEngine`) runs all forest modules sequentially with typed handoffs, producing a final `AlphaResearchReport` with a deploy/refine/discard recommendation.

The design is governed by three principles: **causal features only** (no future data leakage), **deterministic computation** (same inputs always produce the same outputs), and **paper-only execution** (no live trading capability).

---

## 2. Architecture Layers

### 2.1 Tree Layer

The Tree layer lives under `src/tree/` and contains the atomic building blocks.

| Subsystem | Location | Purpose |
|---|---|---|
| Alpha Types | `tree/alpha/types.ts` | Core interfaces: `AlphaSignal`, `AlphaSource`, `AlphaDirection`, `FeatureVector`, `AlphaCombinerConfig`, `AlphaCompositeResult` |
| Indicator Types | `tree/alpha/indicator-types.ts` | `IndicatorCandle`, `IndicatorResult`, `IndicatorFn`, `IndicatorRegistry` |
| Indicators | `tree/alpha/indicators.ts` | 12 pure indicator functions (SMA, EMA, RSI, ATR, Bollinger, MACD, volume Z-score, returns, log returns, momentum, realized volatility, distance from MA) |
| Combiner | `tree/alpha/combiner.ts` | Merges multiple `AlphaSignal` instances into one composite signal via weighted_sum, voting, or max_confidence |
| Labeling | `tree/alpha/labeling.ts` | Triple-barrier event labeling: take-profit, stop-loss, and timeout barriers applied to candle series |
| Correlation | `tree/alpha/correlation/` | Pearson correlation, z-score spread, half-life of mean reversion, ADF stationarity test for pairs trading |
| Factors | `tree/alpha/factors/` | OLS single and multi-factor regression, t-stat ranking, R-squared computation |
| Portfolio | `tree/alpha/portfolio/` | Signal-to-allocation engine with 4 sizing methods and regime multipliers |
| Regime Types | `tree/regime/types.ts` | `RegimeLabel` enum (7 regimes), `RegimeFeatures`, `RegimeResult`, `RegimeConfig` |
| Regime Features | `tree/regime/features.ts` | Pure causal feature extraction: realized volatility, ATR, trend strength, MA slope, return dispersion, volume abnormality |
| Regime Classifier | `tree/regime/classifier.ts` | Deterministic rule-based classifier with hysteresis (minDuration + confidenceThreshold gating) |
| Regime History | `tree/regime/history.ts` | In-memory rolling window store for regime transitions, with duration and transition statistics |
| Alpha Router | `tree/regime/alpha-router.ts` | Regime-conditioned signal filter: maps regime labels to preferred directions, filters and ranks signals |

### 2.2 Forest Layer

The Forest layer lives under `src/forest/` and orchestrates tree-layer components into complete workflows.

| Subsystem | Location | Purpose |
|---|---|---|
| Backtest Engine | `forest/backtest/engine.ts` | Core backtesting loop over OHLCV candles with paper exchange |
| Paper Exchange | `forest/backtest/paper-exchange.ts` | Simulated order matching engine for paper trading |
| Walk-Forward | `forest/backtest/walkforward.ts` | Rolling/expanding window optimization preventing overfitting |
| Cost Model | `forest/backtest/cost-model.ts` | Fee, slippage, and market impact simulation across 3 stress modes |
| Metrics | `forest/backtest/metrics.ts` | Core backtest metrics (Sharpe, drawdown, win rate, PnL) |
| Extended Metrics | `forest/backtest/metrics-extended.ts` | Advanced metrics: Sortino, Calmar, profit factor, expectancy, turnover, recovery factor, exposure |
| Regime Backtest | `forest/backtest/regime-backtest.ts` | Regime-segmented backtesting with per-regime metric breakdowns |
| Pipeline Engine | `forest/alpha/pipeline/engine.ts` | Top-level orchestrator: runs all steps sequentially, produces `AlphaResearchReport` |
| Data Fetcher | `forest/alpha/data-fetcher.ts` | OHLCV candle fetcher with Binance/Bybit/OKX REST APIs, rate limiting, retry with backoff |
| Attribution | `forest/alpha/attribution/` | Per-alpha performance attribution, regime breakdown, feature importance ranking |
| Baselines | `forest/alpha/baselines/` | Benchmark strategies: buy-and-hold, random entry, simple momentum, simple mean reversion |
| Evaluation | `forest/alpha/evaluation/` | Comprehensive report generation with regime, monthly, volatility, and duration segmentation |
| Reports | `forest/alpha/reports/` | Report formatting and markdown generation |
| Dashboard | `forest/alpha/dashboard/` | Real-time state management and telemetry for the alpha dashboard UI |
| Execution | `forest/alpha/execution/` | Paper-trading position management with regime-aware signal filtering |
| Experiments | `forest/alpha/experiments/` | A/B experiment runner for comparing strategy variants |
| Performance | `forest/alpha/performance/` | Batch processing and caching for pipeline runs |
| Persistence | `forest/alpha/persistence/` | D1 and JSON adapters for storing pipeline results |
| Integration | `forest/alpha/integration/` | Synthetic fixture generation for integration tests |

### 2.3 Integration Layer

The Integration layer connects Tree and Forest components:

- **Pipeline Engine** (`forest/alpha/pipeline/engine.ts`): Orchestrates the full research workflow with typed handoffs between steps.
- **Regime-Alpha Router** (`tree/regime/alpha-router.ts`): Bridges regime classification results with alpha signal filtering.
- **Portfolio Optimizer** (`tree/alpha/portfolio/optimizer.ts`): Bridges signal confidence with position sizing and regime multipliers.
- **Data Fetcher** (`forest/alpha/data-fetcher.ts`): Provides OHLCV data to both Tree indicators and Forest backtest modules.

---

## 3. Data Flow

The Alpha Discovery Engine processes data through a linear pipeline:

```
Raw OHLCV Candles
    |
    v
[Data Fetcher] -- fetch from Binance/Bybit/OKX with retry + rate limiting
    |
    v
[Indicator Computation] -- 12 pure functions produce IndicatorResult[]
    |
    v
[Feature Extraction] -- regime features (6 dimensions) + factor exposures
    |
    v
[Signal Generation] -- indicators produce AlphaSignal[] with direction + confidence
    |
    v
[Labeling] -- triple-barrier labels assign +1/-1/null to each signal event
    |
    v
[Regime Classification] -- deterministic rule-based with hysteresis gating
    |
    v
[Alpha Routing] -- filter and rank signals by regime-conditioned preferences
    |
    v
[Walk-Forward Validation] -- rolling/expanding windows: train -> validate -> test
    |
    v
[Cost Model Application] -- fees + slippage + market impact across 3 stress modes
    |
    v
[Extended Metrics] -- Sharpe, Sortino, Calmar, profit factor, turnover, etc.
    |
    v
[Attribution Analysis] -- per-alpha contribution, regime breakdown, feature importance
    |
    v
[Baseline Comparison] -- buy-hold, random, momentum, mean-reversion benchmarks
    |
    v
[Evaluation Report] -- segmented by regime, month, volatility bucket, trade duration
    |
    v
[AlphaResearchReport] -- final recommendation: deploy / refine / discard
```

Each step receives typed input from the previous step. The Pipeline Engine captures per-step timing, status, and errors. If any step fails, subsequent steps are skipped and the error is recorded.

---

## 4. Component Map

| Module | File Path | Purpose | Key Exports |
|---|---|---|---|
| Alpha Types | `src/tree/alpha/types.ts` | Core alpha interfaces | `AlphaSignal`, `AlphaSource`, `AlphaDirection`, `FeatureVector`, `AlphaCombinerConfig`, `AlphaCompositeResult` |
| Indicator Types | `src/tree/alpha/indicator-types.ts` | Indicator type definitions | `IndicatorCandle`, `IndicatorResult`, `IndicatorFn`, `IndicatorRegistry`, `MACDValue`, `BollingerBands` |
| Indicators | `src/tree/alpha/indicators.ts` | 12 pure indicator functions | `indicators` (registry), `smaIndicator`, `rsiIndicator`, `macdIndicator`, etc. |
| Combiner | `src/tree/alpha/combiner.ts` | Signal merging | `combineSignals`, `combineWeightedSum`, `combineVoting`, `combineMaxConfidence` |
| Labeling | `src/tree/alpha/labeling.ts` | Triple-barrier labeling | `labelCandle`, `BarrierConfig`, `BarrierLabel` |
| Correlation | `src/tree/alpha/correlation/compute.ts` | Pairs correlation analysis | `pearsonCorrelation`, `rollingCorrelation`, `zScoreSpread`, `halfLife`, `adfTest` |
| Correlation Pairs | `src/tree/alpha/correlation/pairs.ts` | Pair selection and cointegration | `findCointegratedPairs`, `selectBestPairs` |
| ADF Test | `src/tree/alpha/correlation/adf.ts` | Augmented Dickey-Fuller test | `adfTest`, `ADFResult` |
| Factor Analysis | `src/tree/alpha/factors/analysis.ts` | OLS factor exposure | `singleFactorAnalysis`, `multiFactorAnalysis`, `rankFactorsByExposure` |
| Factor Types | `src/tree/alpha/factors/types.ts` | Factor type definitions | `Factor`, `FactorExposure`, `FactorAnalysisResult` |
| Portfolio Optimizer | `src/tree/alpha/portfolio/optimizer.ts` | Signal-to-allocation | `optimize`, `computeRegimeMultiplier` |
| Portfolio Types | `src/tree/alpha/portfolio/types.ts` | Optimizer type definitions | `Allocation`, `PortfolioTarget`, `OptimizerConfig`, `OptimizerMethod` |
| Regime Types | `src/tree/regime/types.ts` | Regime type definitions | `RegimeLabel` (7 values), `RegimeFeatures`, `RegimeResult`, `RegimeConfig` |
| Regime Features | `src/tree/regime/features.ts` | Pure causal feature extraction | `extractRegimeFeatures` |
| Regime Classifier | `src/tree/regime/classifier.ts` | Rule-based regime classification | `RegimeClassifier`, `classifyRegime` |
| Regime History | `src/tree/regime/history.ts` | Rolling regime history | `RegimeHistoryStore` |
| Alpha Router | `src/tree/regime/alpha-router.ts` | Regime-conditioned signal filter | `filterByRegime` |
| Backtest Engine | `src/forest/backtest/engine.ts` | Core backtesting loop | `runBacktest` |
| Paper Exchange | `src/forest/backtest/paper-exchange.ts` | Simulated order matching | `PaperExchange`, `Fill` |
| Walk-Forward | `src/forest/backtest/walkforward.ts` | Walk-forward validation | `runWalkForward`, `WindowConfig`, `WalkForwardResult` |
| Cost Model | `src/forest/backtest/cost-model.ts` | Fee/slippage/impact modeling | `applyCosts`, `CostConfig`, `CostResult`, `StressMode` |
| Metrics | `src/forest/backtest/metrics.ts` | Core performance metrics | `computeMetrics`, `BacktestMetrics` |
| Extended Metrics | `src/forest/backtest/metrics-extended.ts` | Advanced performance metrics | `computeExtendedMetrics`, `ExtendedBacktestMetrics` |
| Regime Backtest | `src/forest/backtest/regime-backtest.ts` | Per-regime segmented backtest | `runRegimeBacktest` |
| Pipeline Engine | `src/forest/alpha/pipeline/engine.ts` | Full research pipeline | `PipelineEngine`, `AlphaResearchReport`, `PipelineRecommendation` |
| Pipeline Types | `src/forest/alpha/pipeline/types.ts` | Pipeline type definitions | `PipelineConfig`, `PipelineStep`, `PipelineStepResult`, `AlphaResearchReport` |
| Data Fetcher | `src/forest/alpha/data-fetcher.ts` | OHLCV candle fetcher | `fetchCandles`, `fetchMultiple`, `FetchConfig`, `DataSource` |
| Attribution | `src/forest/alpha/attribution/analyzer.ts` | Alpha performance attribution | `computeAttribution`, `AttributionResult` |
| Baselines | `src/forest/alpha/baselines/runner.ts` | Benchmark strategy runner | `runBaseline`, `BaselineConfig` |
| Baselines Report | `src/forest/alpha/baselines/report-builder.ts` | Baseline report construction | `buildReport`, `emptyReport` |
| Evaluation Report | `src/forest/alpha/evaluation/report.ts` | Comprehensive evaluation | `buildEvaluationReport`, `EvaluationReport` |
| Report Helpers | `src/forest/alpha/evaluation/report-helpers.ts` | Segmentation utilities | `classifyVol`, `monthKey`, `durationBucket`, `reportFromTrades` |
| Reports Generator | `src/forest/alpha/reports/generator.ts` | Markdown report generation | `generateReport` |
| Dashboard State | `src/forest/alpha/dashboard/state.ts` | Dashboard state management | `DashboardState` |
| Execution Engine | `src/forest/alpha/execution/engine.ts` | Paper-trading execution | `AlphaExecutionEngine`, `AlphaPortfolio`, `AlphaPosition` |
| Execution Types | `src/forest/alpha/execution/types.ts` | Execution type definitions | `AlphaExecutionConfig`, `AlphaPosition`, `AlphaPortfolio`, `AlphaRejectionReason` |
| Experiments | `src/forest/alpha/experiments/runner.ts` | A/B experiment runner | `runExperiment` |
| Persistence D1 | `src/forest/alpha/persistence/d1-adapter.ts` | Cloudflare D1 storage adapter | `D1PersistenceAdapter` |
| Persistence JSON | `src/forest/alpha/persistence/json-adapter.ts` | JSON file storage adapter | `JsonPersistenceAdapter` |
| Integration Fixtures | `src/forest/alpha/integration/fixtures.ts` | Synthetic test data | `generateSyntheticCandles`, `generateSyntheticSignals` |

---

## 5. Regime System

### 5.1 Seven Regimes

The regime classifier identifies seven distinct market conditions:

| Regime | Label | Description |
|---|---|---|
| Trend Up | `TREND_UP` | Sustained upward price movement with positive MA slope |
| Trend Down | `TREND_DOWN` | Sustained downward price movement with negative MA slope |
| Range | `RANGE` | Price oscillating around a mean, low directional strength |
| High Volatility | `HIGH_VOLATILITY` | Elevated realized volatility and ATR |
| Low Volatility | `LOW_VOLATILITY` | Compressed volatility, potential breakout setup |
| Shock | `SHOCK` | Extreme price dislocation, volume spike |
| Unknown | `UNKNOWN` | Insufficient data or ambiguous classification |

### 5.2 Feature Extraction

All features are **causal** -- computed only from data available at each timestamp:

1. **Realized Volatility** -- standard deviation of log returns over the lookback window.
2. **ATR** -- Average True Range over the lookback window, normalized by price.
3. **Trend Strength** -- directional movement index derived from consecutive returns.
4. **MA Slope** -- slope of a simple moving average, indicating trend direction.
5. **Return Dispersion** -- cross-candle return standard deviation, measuring price clustering.
6. **Volume Abnormality** -- z-score of current volume vs. lookback mean, detecting unusual activity.

### 5.3 Hysteresis

The classifier uses two stability mechanisms to prevent noisy regime oscillation:

- **Minimum Duration** (`minDuration`): A regime must persist for at least N consecutive periods before a transition is allowed. This prevents rapid toggling between adjacent regimes.
- **Confidence Threshold** (`confidenceThreshold`): Non-UNKNOWN labels require a minimum confidence score. Below this threshold, the classifier returns UNKNOWN or maintains the current regime.

### 5.4 Alpha Routing

The `filterByRegime` function maps regime labels to preferred signal directions:

| Regime | Preferred Directions | Strategy |
|---|---|---|
| TREND_UP | buy | Trend-following long only |
| TREND_DOWN | sell | Trend-following short only |
| RANGE | buy, sell | Mean-reversion both sides |
| HIGH_VOLATILITY | buy, sell | Volatility-based both sides |
| LOW_VOLATILITY | buy, sell | Breakout-based both sides |
| SHOCK | (none) | All signals rejected |
| UNKNOWN | (none) | All signals rejected |

Signals that do not match the regime's preferred directions are filtered out. Remaining signals are ranked by confidence and sliced to `topN`.

---

## 6. Walk-Forward Validation

Walk-forward validation is the primary overfitting defense. It divides the data into sequential windows, each with three non-overlapping segments:

```
|<-- trainBars -->|<-- validateBars -->|<-- testBars -->|
                    |
                    step forward by stepBars
```

### 6.1 Window Phases

1. **Training** (`trainBars`): Strategy parameters are optimized on historical data.
2. **Validation** (`validateBars`): Optimized parameters are validated on unseen in-sample data.
3. **Test** (`testBars`): Final performance is measured on completely out-of-sample data.

### 6.2 Rolling vs. Expanding

The engine supports two window modes:

- **Rolling**: The training window slides forward by `stepBars` on each iteration, keeping the training size fixed. This assumes a stationarity window.
- **Expanding**: The training window grows from the start of the dataset, incorporating all historical data. This uses more data but may include outdated patterns.

### 6.3 Aggregation

Results from all windows are aggregated:

- **In-sample Sharpe** averaged across windows
- **Out-of-sample Sharpe** averaged across windows
- **Degradation ratio**: `avgOutSampleSharpe / avgInSampleSharpe` -- values well below 1.0 indicate overfitting
- **Regime diversity**: count of distinct regimes encountered across windows
- **Per-regime breakdown**: metrics grouped by regime label

### 6.4 Configuration

```typescript
interface WindowConfig {
  trainBars: number;    // Training window size
  validateBars: number; // Validation window size
  testBars: number;     // Test window size
  stepBars: number;     // Step size for window advancement
}
```

---

## 7. Cost Model

The cost model simulates realistic trading costs across three stress modes, ensuring strategies remain profitable under adverse conditions.

### 7.1 Stress Modes

| Mode | Description | Use Case |
|---|---|---|
| `normal` | Default fee and slippage assumptions | Baseline performance measurement |
| `conservative` | Elevated fees and slippage (typically 1.5-2x normal) | Conservative performance floor |
| `adverse` | Worst-case fees, slippage, and market impact | Stress test -- strategy must survive |

### 7.2 Cost Components

Each trade incurs three cost components:

1. **Fees** (`feePct`): Exchange taker fee as a fraction of notional value. Typical: 5-10 bps.
2. **Slippage** (`slipPct`): Price deviation between order placement and fill. Typical: 2-5 bps.
3. **Market Impact** (`marketImpactPct`): Price movement caused by the trade itself, modeled via a square-root impact function scaled by order size relative to average volume.

### 7.3 Cost Application

```typescript
function applyCosts(grossPnl: number, config: CostConfig): CostResult
```

- If `grossPnl <= 0`, no costs are deducted (conservative approach -- losses are not inflated).
- If `grossPnl > 0`, total cost = fees + slippage + market impact, deducted from gross PnL.
- Returns `netPnl`, `fees`, `slippage`, and `marketImpact` as separate fields for attribution.

---

## 8. Portfolio Optimization

The portfolio optimizer converts alpha signals into concrete position allocations.

### 8.1 Four Allocation Methods

| Method | Description |
|---|---|
| `equal_weight` | All qualifying signals receive equal portfolio weight |
| `confidence_weighted` | Weights proportional to signal confidence score |
| `inverse_volatility` | Higher weights to lower-volatility signals (risk parity) |
| `regime_sized` | Weights adjusted by regime multiplier: TREND_UP (1.2x), TREND_DOWN (0.8x), RANGE (1.0x), HIGH_VOL (0.6x), LOW_VOL (0.9x), SHOCK (0.3x) |

### 8.2 Regime Multipliers

The `computeRegimeMultiplier` function returns a scaling factor between 0 and 1.5:

| Regime | Multiplier | Rationale |
|---|---|---|
| TREND_UP | 1.2 | Increase allocation in favorable trend |
| TREND_DOWN | 0.8 | Moderate reduction in downtrend |
| RANGE | 1.0 | Neutral |
| HIGH_VOLATILITY | 0.6 | Reduce size during extreme volatility |
| LOW_VOLATILITY | 0.9 | Slight reduction, breakout opportunity |
| SHOCK | 0.3 | Minimal allocation during market shocks |
| UNKNOWN | 0.0 | No allocation when regime is unclear |

### 8.3 Constraints

- **Max Exposure** (`maxExposurePct`): Total portfolio weight capped as fraction of equity.
- **Min Confidence** (`minConfidence`): Signals below this threshold are excluded.
- **Cash Reserve** (`cashReservePct`): Fraction of equity held as unallocated cash.
- **Max Positions** (`maxPositions`): Hard cap on simultaneous open positions.
- **Leverage Ratio**: Computed as `totalExposure / (1 - cashReservePct)`. Values above 1.0 indicate leveraged positioning.

---

## 9. Execution Layer

The execution engine manages paper-trading positions based on alpha signals and regime context.

### 9.1 Position Lifecycle

1. **Signal Reception**: Engine receives `AlphaSignal` with direction and confidence.
2. **Filtering**: Signal is checked against regime preferences, confidence threshold, and duplicate detection.
3. **Position Sizing**: Position size derived from signal confidence and regime multiplier.
4. **Entry**: Paper position opened with entry price, quantity, direction, and regime tag.
5. **Monitoring**: Open positions are checked on each tick for stop-loss, take-profit, and timeout.
6. **Exit**: Position closed on signal reversal, stop-loss hit, take-profit hit, or timeout expiration.

### 9.2 Rejection Reasons

Signals are rejected for one of six reasons:

| Reason | Description |
|---|---|
| `disabled` | Execution engine is not active |
| `confidence_below_threshold` | Signal confidence below `minConfidence` |
| `regime_filtered` | Signal direction conflicts with current regime preferences |
| `max_positions_reached` | All position slots are occupied |
| `max_exposure_reached` | Total portfolio exposure exceeds `maxExposurePct` |
| `duplicate_signal` | Identical signal already has an open position |

### 9.3 Telemetry

The engine emits `AlphaExecutionTelemetry` events for each action:

- `position_opened`: New paper position created.
- `position_closed`: Position closed with PnL.
- `signal_rejected`: Signal rejected with reason.
- `portfolio_snapshot`: Periodic portfolio state summary.

Telemetry is buffered and drained by the parent tick loop.

---

## 10. Testing Strategy

### 10.1 Unit Tests

Every Tree-layer module has co-located unit tests:

- **Indicators**: Each of the 12 indicator functions is tested with known inputs and expected outputs.
- **Combiner**: All three combination methods tested with edge cases (empty arrays, single signal, conflicting signals).
- **Labeling**: Triple-barrier labeling tested with synthetic candle sequences that trigger each barrier type.
- **Regime Classifier**: Classification logic tested against hand-crafted feature vectors for each regime.
- **Factor Analysis**: OLS regression tested against known factor exposures.
- **Correlation**: Pearson, spread, half-life, and ADF tested with synthetic price series.
- **Portfolio Optimizer**: All four allocation methods tested, including constraint edge cases.

### 10.2 Integration Tests

Forest-layer integration tests verify component interaction:

- **Pipeline Engine**: End-to-end run with synthetic candle data, verifying all steps execute in order.
- **Walk-Forward**: Multi-window run verifying correct train/validate/test splitting and aggregation.
- **Cost Model**: Cross-verification of cost calculations across all three stress modes.
- **Execution Engine**: Full signal-to-position lifecycle with regime filtering.
- **Baselines**: Benchmark strategy execution compared against backtest engine output.

### 10.3 Synthetic Fixtures

The `forest/alpha/integration/fixtures.ts` module generates deterministic synthetic data:

- **Synthetic Candles**: OHLCV candles with configurable trend, volatility, and mean-reversion characteristics.
- **Synthetic Signals**: Alpha signals with predefined directions, confidences, and regime associations.
- **Seeded PRNG**: All random generators use deterministic seeds for reproducible tests.

---

## 11. Safety Constraints

The Alpha Discovery Engine enforces strict safety boundaries:

### 11.1 Paper/Backtest Only

- The execution engine operates exclusively in paper-trading mode.
- No live order placement capability exists anywhere in the codebase.
- All exchange interactions are read-only (market data fetching only).
- Paper positions have no connection to any real exchange account.

### 11.2 No Real Orders

- The `PaperExchange` module simulates order matching locally.
- No order submission, amendment, or cancellation functions exist for live exchanges.
- Rate limiting is applied to data fetching endpoints only.

### 11.3 Causal Features Only

- All indicator functions receive only historical data available at each timestamp.
- No future data leakage is possible in the indicator computation chain.
- Regime features are computed from a lookback window ending at the current candle.
- Walk-forward validation enforces strict temporal separation between train, validate, and test segments.

### 11.4 Deterministic Computation

- All Tree-layer functions are pure: no side effects, no I/O, no input mutation.
- Same inputs always produce identical outputs.
- This enables reliable testing and debugging.

---

## 12. Module Sizes

All source files (excluding type-only and barrel/re-export files) are kept under 200 lines.

| File | Lines | Under 200? |
|---|---|---|
| `tree/alpha/types.ts` | 144 | Yes |
| `tree/alpha/indicator-types.ts` | 66 | Yes |
| `tree/alpha/indicators.ts` | 256 | No |
| `tree/alpha/combiner.ts` | 143 | Yes |
| `tree/alpha/labeling.ts` | 129 | Yes |
| `tree/alpha/correlation/compute.ts` | 114 | Yes |
| `tree/alpha/correlation/pairs.ts` | 110 | Yes |
| `tree/alpha/correlation/adf.ts` | 66 | Yes |
| `tree/alpha/correlation/math-helpers.ts` | 30 | Yes |
| `tree/alpha/factors/analysis.ts` | 194 | Yes |
| `tree/alpha/factors/types.ts` | 33 | Yes |
| `tree/alpha/portfolio/optimizer.ts` | 148 | Yes |
| `tree/alpha/portfolio/types.ts` | 57 | Yes |
| `tree/regime/types.ts` | 53 | Yes |
| `tree/regime/features.ts` | 200 | Yes |
| `tree/regime/classifier.ts` | 191 | Yes |
| `tree/regime/alpha-router.ts` | 99 | Yes |
| `tree/regime/history.ts` | 56 | Yes |
| `forest/backtest/engine.ts` | 89 | Yes |
| `forest/backtest/paper-exchange.ts` | 100 | Yes |
| `forest/backtest/walkforward.ts` | 176 | Yes |
| `forest/backtest/cost-model.ts` | 95 | Yes |
| `forest/backtest/metrics.ts` | 113 | Yes |
| `forest/backtest/metrics-extended.ts` | 172 | Yes |
| `forest/backtest/regime-backtest.ts` | 176 | Yes |
| `forest/backtest/types.ts` | 58 | Yes |
| `forest/backtest/data-fetcher.ts` | 155 | Yes |
| `forest/backtest/actions.ts` | 146 | Yes |
| `forest/alpha/pipeline/engine.ts` | 197 | Yes |
| `forest/alpha/pipeline/types.ts` | 149 | Yes |
| `forest/alpha/data-fetcher.ts` | 184 | Yes |
| `forest/alpha/attribution/analyzer.ts` | 156 | Yes |
| `forest/alpha/attribution/types.ts` | 58 | Yes |
| `forest/alpha/baselines/runner.ts` | 146 | Yes |
| `forest/alpha/baselines/report-builder.ts` | 97 | Yes |
| `forest/alpha/evaluation/report.ts` | 141 | Yes |
| `forest/alpha/evaluation/report-helpers.ts` | 124 | Yes |
| `forest/alpha/execution/engine.ts` | 157 | Yes |
| `forest/alpha/execution/types.ts` | 85 | Yes |
| `forest/alpha/dashboard/state.ts` | 172 | Yes |
| `forest/alpha/dashboard/types.ts` | 98 | Yes |
| `forest/alpha/experiments/runner.ts` | 95 | Yes |
| `forest/alpha/experiments/types.ts` | 159 | Yes |
| `forest/alpha/persistence/d1-adapter.ts` | 192 | Yes |
| `forest/alpha/persistence/json-adapter.ts` | 126 | Yes |
| `forest/alpha/persistence/types.ts` | 108 | Yes |
| `forest/alpha/integration/fixtures.ts` | 122 | Yes |
| `forest/alpha/reports/generator.ts` | 132 | Yes |
| `forest/alpha/reports/formatter.ts` | 53 | Yes |
| `forest/alpha/performance/batch.ts` | 63 | Yes |
| `forest/alpha/performance/cache.ts` | 77 | Yes |

**Summary**: 1 file (`indicators.ts` at 256 lines) exceeds the 200-line target. All other 50 source files are under 200 lines.

---

*Document version: Phase 12. Last updated: 2026-08-17.*
