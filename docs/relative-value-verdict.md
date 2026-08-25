# Relative-Value Pairs — Out-of-Sample Verdict

**Date:** 2026-08-26
**Verdict:** **KILLED** (primary arm M4 falsified)
**Scope:** Real-data walk-forward of the pairs/relative-value alpha family, arms M1–M4, Binance daily klines, paper/backtest only.
**Artifacts:** `plans/reports/rv-pairs-verdict.json` (verdict + arm table), `plans/reports/rv-pairs-m4-survival.json` (M4 battery: gate checks, benchmarks, ablation, robustness, report metrics).
**Reproduce:** `npx tsx scripts/rv-pairs-verdict.ts` (manual-only; never imported by vitest).

## Pre-registered protocol

- Universe (8 symbols, 28 pairs): BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT.
- Data: Binance 1d klines × 1000 bars; timestamp intersection = exactly 1000 aligned bars; no gaps after alignment.
- Windows: rolling train 250 / validate 50 / test 100, step 100 → 7 OOS windows.
- Arms: M1 classical distance (frozen β, gate off), M2 static cointegration (frozen β, gate on), M3 dynamic cointegration (rolling β, gate on), **M4 regime-aware = PRIMARY** (rolling β, stability-ranked selection, causal BTC SMA50 entry filter).
- Sim config: zWindow 20, entryZ 2.0, exitZ 0.5, stopZ 3.5, hedge window 60, validationWindow 80, conservative stress (fees 0.08% + slippage 0.03% per leg).
- Funding carry: N/A — Binance derivative endpoints return HTTP 403 from this environment (FUNDING_NOTE convention); spot klines only.
- Verdict rule: SURVIVED iff `evaluateSurvival(...).verdict === 'survived'` AND `runSurvivalGate(report).status === 'PAPER_CANDIDATE'` on M4 only. No cherry-picking across arms.

## Result — primary arm M4: KILLED

Survival battery could not even run: the stitched OOS series contains **0 completed round-trip trades**, and `assembleSurvivalInput` fails closed at "at least 2 completed trades required for bootstrap, got 0". The survival gate fails 4/8 checks:

| Check | Actual | Threshold | Passed |
|---|---|---|---|
| min_trades | 0 | ≥ 20 | NO |
| min_expectancy | 0 | ≥ 0 | yes |
| min_profit_factor | 0 | ≥ 1.2 | NO |
| max_drawdown | 0 | ≤ 0.3 | yes |
| min_sharpe | null | ≥ 0.5 | NO |
| min_regime_coverage | 0/1 | ≥ 50% | NO |
| min_net_pnl_after_fees | 0 | ≥ 0 | yes |
| min_net_pnl_adverse | 0 | ≥ 0 | yes |

Failed checks verbatim:
- `min_trades: 0 trades vs. minimum 20`
- `min_profit_factor: Profit factor 0.00 vs. minimum 1.2`
- `min_sharpe: Sharpe is null (insufficient data) — fails`
- `min_regime_coverage: 0/1 regimes traded vs. minimum 50%`
- Survival input: `assembleSurvivalInput: at least 2 completed trades required for bootstrap, got 0`

## Arm comparison (comparative evidence only — verdict is M4)

| Arm | OOS periods | Completed trades | Selected pairs (7 windows) | OOS expectancy | Gate |
|---|---|---|---|---|---|
| M1 distance, frozen β, no gate | 3465 | 722 | 35 | −0.020431 | KILLED |
| M2 cointegration, frozen β | 297 | 0 | 3 | 0 | KILLED |
| M3 dynamic β | 297 | 0 | 3 | 0 | KILLED |
| M4 M3 + stability + regime filter | 297 | 0 | 3 | 0 | KILLED |

Reading:
- M1 trades freely (gate off) but its expectancy is **negative** (−0.0204 per period) after both-leg fees+slippage under conservative stress — classical distance pairs lose money out-of-sample here; its gate fails 6/8 checks including negative net PnL under adverse slippage.
- M2/M3/M4 select very few pairs (3 pair-window selections across 7 windows total) and complete **zero** trades.

## Why zero trades in M2–M4 (root cause, measured not assumed)

The conjunctive in-sim tradability gate (ADF p < 0.05 ∧ half-life ≤ 50 ∧ |corr| ≥ 0.5 over a trailing 80-bar slice) plus the strict selection pipeline almost never certifies a tradable pair-window on real crypto dailies, and the few certified ones never produce an entry. Ablation isolates it: removing `in_sim_gate` alone moves M4 from 0 trades to positive expectancy (+0.0113/period), i.e. the entire OOS activity lives behind a gate that stays closed; every other ablated component shows Δ = 0 because there is nothing to ablate. Robustness sensitivity is likewise degenerate (maxDelta 0, normalizedSpread 0, sensitive: false) for the same reason.

This is a genuine empirical result of the pre-registered configuration, not a data or code failure: all 8 symbols loaded fully, timestamps intersected at 1000 bars, seeds deterministic, and the same engine (`runPairSpreadSim` via `runRVWalkForward`) produced every period.

## Benchmarks (price-unit, identical M4 OOS span, directional comparison only)

| Strategy | Expectancy (price units) | Profit factor | Trades | Max DD |
|---|---|---|---|---|
| buy_hold | +3957.65 | n/a (long-only) | 8 | 0 |
| random_entry | +31.28 | 1.55 | 144 | 2792.39 |
| simple_momentum | −396.66 | 0.67 | 24 | 3219.53 |
| simple_mean_reversion | +311.69 | 2.78 | 69 | 886.77 |

Benchmark reports are price-unit (equity anchored at 1000) while RV reports are portfolio-fraction; they are compared directionally only, never numerically mixed.

## Protocol deviation recorded

Initial protocol draft used zWindow 5 before any real run. Population-std z-score caps |z| at √(zWindow−1), so with zWindow 5 the maximum attainable |z| ≈ 2.0 made entryZ = 2.0 unreachable by construction (first run: 0 trades across ALL arms including M1). Corrected to zWindow 20 (√19 ≈ 4.36 ceiling, covers the robustness grid up to entryZ 2.5) BEFORE the verdict run; the correction and reason are recorded here rather than silently patched.

## Conclusion

The relative-value pairs family is **KILLED** on this universe/timeframe/configuration: the primary arm completes no trades out-of-sample, and the only arm that does trade loses money net of costs. Per plan §Step-12 semantics, this family does not advance to paper-trading candidacy. The engine, gates, adapters, benchmarks, ablation, robustness, and multiple-testing stack built in Steps 7–10 remain valid, reusable infrastructure — the verdict is about the strategy, not the tooling.

Falsification is a feature: no fabricated numbers were needed to reach this verdict, and none are present.
