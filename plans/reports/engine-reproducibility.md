# Alpha Research Pipeline — Reproducibility & Falsification Guide

> How to run, reproduce, and interpret results from the alpha research pipeline.

## Running the Pipeline

The pipeline is orchestrated by `AlphaResearchPipeline` in `src/forest/alpha/pipeline/engine.ts`.
It can be invoked via:

- **Unit tests**: `npm test -- --grep "pipeline"` (runs engine.test.ts and e2e-run.test.ts)
- **Direct invocation**: Import and call `new AlphaResearchPipeline(config).run()`
  from any Node.js context (e.g. a script or REPL).

### Test Suites

| Suite | Path | What it tests |
|---|---|---|
| Engine unit | `src/forest/alpha/pipeline/engine.test.ts` | Individual step behavior, error handling, stopping logic |
| E2E run | `src/forest/alpha/pipeline/e2e-run.test.ts` | Full pipeline with mocked data, verifies report shape |
| Integration | `src/forest/alpha/integration/*.test.ts` | Regime detection, indicator computation, labeling, walkforward |

All test suites use vitest and run via `npm test`.

## Data Sources

| Source | Provider | Auth Required | Rate Limits |
|---|---|---|---|
| OHLCV candles | Binance / Bybit / OKX public kline APIs | No | ~1200 req/min (Binance) |
| Funding rate | Binance futures `/fapi/v1/fundingRate` | No | Same as above |
| Open interest | Binance futures `/futures/data/openInterestHist` | No | Same as above |
| Liquidations | Coinglass (via `fetchLiquidations`) | API key | Tier-based |
| Premium index | Binance futures `/fapi/v1/premiumIndex` | No | Same as above |

OHLCV data is cached in `.cache/ohlcv/` to avoid repeated rate-limit hits during development.
Cache is automatically disabled when `NODE_ENV=test` or `VITEST=1`.

## Reproducing Results

1. **Clone and install**: `npm install`
2. **Run the full test suite**: `npm test`
3. **Run the pipeline directly**: See any script under `src/forest/alpha/experiments/runner.ts`
   or `src/forest/alpha/demo.ts` for example invocations.
4. **Seed data**: Tests use deterministic mock data. Live runs fetch from exchange APIs
   and are subject to market conditions at the time of the run.

### Determinism Notes

- Mock-based tests are fully deterministic.
- Live pipeline runs depend on real market data and API availability.
- The `ohlcV-cache` layer ensures repeated runs in the same environment
  return consistent results (until cache is cleared).
- Walkforward Sharpe is computed from trades extracted from signals, which are
  deterministic given the same candle/regime/indicator inputs.

## Cost Model Parameters

The cost model (`src/forest/backtest/cost-model.ts`) applies:

| Parameter | Default Value | Description |
|---|---|---|
| `feePct` | 0.001 (0.1%) | Exchange trading fee |
| `slipPct` | 0.0005 (0.05%) | Estimated slippage per trade |
| `marketImpactPct` | 0.0002 (0.02%) | Market impact cost (set to 0 in walkforward) |

These are resolved via `resolveStressConfig(costMode)` where `costMode` is one of:
`base`, `moderate`, `aggressive`.

## Known Limitations

1. **label_events step output is unused**: The `label_events` pipeline step produces an `EventData` object (direction labels), but no downstream step or the final report reads it. See dead-weight analysis below.

2. **compare_baselines output not in report**: The `compare_baselines` step runs baseline strategies (buy_hold, simple_momentum) and produces comparison data, but the final `AlphaResearchReport` does not include it. The data is available via `pipeline.getResults()` but not surfaced in the report.

3. **compute_costs output not in report**: Cost breakdown is computed but not included in the final report.

4. **generate_report step is a no-op**: Listed in the step array but has no case handler — falls through to `default: return null`.

5. **Derivative features not used by signal generation**: The `features` field from `fetch_derivatives` is computed but never consumed; only `signals` from derivatives are merged into the signal stream.

6. **Regime breakdown is always zeroed**: The `report()` method initializes `regimeBreakdown` with `{ trades: 0, winRate: 0 }` for every regime label but never populates actual trade/win counts per regime.

7. **Single-period walkforward only**: The current implementation does a single train/test split rather than true rolling walkforward despite parameterizing `stepBars`.

8. **No live exchange calls in tests**: All exchange interactions are mocked. Integration with real APIs is only tested via manual runs or dedicated integration tests.

## Data Flow Diagram (Simplified)

```
fetch_data (candles)
  ├─> compute_indicators (features)
  │     └─> generate_signals ──> label_events (UNUSED)
  │     └─> ...
  ├─> detect_regimes (regimes)
  │     └─> generate_signals
  │     └─> evaluate
  │     └─> attribute
  │     └─> report (regimeBreakdown — zeroed)
  └─> fetch_derivatives (signals only; features unused)
        └─> generate_signals ──> run_walkforward ──> report (sharpe)
                               ──> evaluate ──> compute_costs (UNUSED)
                               ──> attribute ──> report (topFeatures)
                                      ──> compare_baselines (UNUSED)
```
