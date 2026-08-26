# Pairs / Relative-Value Research Integration Audit

Date: 2026-08-26 · Branch: `feat/rv-pairs-alpha-family` · Status: PRE-REGISTERED (protocol frozen before any real-data run)

This document integrates an external pairs-trading methodology audit with the
Alpha Lab's existing relative-value engine, and pre-registers the experiment
protocol. It is the first deliverable of the pairs/relative-value family work
and must exist BEFORE any real-data verdict is produced (anti-search-bias).

## 1. External methodology vs internal state

External source: https://github.com/nutdnuy/pairs-trading-research-skill
(README.md + references/methodology.md, fetched 2026-08-26). Concepts only —
zero external code copied; every implementation is original.

| # | Concept | External approach | Internal state | File / delta |
|---|---------|-------------------|----------------|--------------|
| 1 | Pair selection | PCA + DBSCAN as search-space reducer for large universes; exhaustive pairwise for small; point-in-time membership | NEW | `src/tree/alpha/relative-value/pair-selection.ts` (exhaustive C(n,2), causal slice < trainEnd) |
| 2 | Correlation filtering | No formal gate; correlation is a ranking diagnostic | EXISTS (hard gate) | `src/tree/alpha/relative-value/validation.ts` (`minCorrelation` conjunct) |
| 3 | Cointegration | Engle–Granger on log prices; Benjamini–Hochberg FDR across pairs | EXISTS (EG only) | `src/tree/alpha/correlation/adf.ts` (`testCointegration`); BH = P2 stretch (verdict-level defense already controls burden) |
| 4 | Hedge ratio | OLS β of log(Y) on log(X) | EXISTS | `src/tree/alpha/relative-value/hedge-ratio.ts` (rolling OLS, strictly-before-t); frozen-β variant added to `spread.ts` |
| 5 | Spread construction | Log-price regression residual | EXISTS | `src/tree/alpha/relative-value/spread.ts` (level-price residual; convention documented there) |
| 6 | Half-life | OU fit Δs = λ·s + ε; HL = −log(2)/λ; max-HL gate | EXISTS | `src/tree/alpha/correlation/compute.ts` (`computeSpreadStatistics`) + `validation.ts` (`maxHalfLife` conjunct) |
| 7 | Z-score | Rolling z state machine; info through t decides position earning t→t+1 | EXISTS | `spread.ts` (z from trailing window ending t−1 — same lagged timing) |
| 8 | Entry/exit | Enter z ≤ −entryZ / ≥ +entryZ; exit at mean; stop + max holding | EXISTS | `src/tree/alpha/relative-value/entry-exit.ts` (entry/exit/stop; max-holding not implemented — YAGNI) |
| 9 | Dynamic parameterization | Rolling fits as-of t; formation/validation/holdout splits; warns against per-scenario retuning | PARTIAL | Rolling β EXISTS; walk-forward splits NEW (`src/forest/alpha/relative-value-eval/walk-forward/`); pre-registration below mirrors the retuning warning |
| 10 | Robustness | Formation/OOS separation, contiguous-window pass-rate, cost-stress sweeps, sizing comparison, deflated Sharpe, trial ledger | PARTIAL | Stress modes EXIST (`src/tree/alpha/cost-stress.ts`); stability scoring NEW (`stability.ts`); parameter grid + PBO NEW (`robustness.ts`, later step); survival stack EXISTS (`src/forest/alpha/multiple-testing/evaluate.ts`) |

## 2. Pre-registered experiment protocol (FROZEN)

Frozen before any real-data run. Changing these after seeing OOS results
invalidates the verdict.

- **Universe**: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT, ADAUSDT,
  DOGEUSDT, LINKUSDT (8 liquid USDT spot majors → 28 exhaustive pairs).
- **Data**: Binance spot OHLCV, 1d interval, 1000 bars (~2.7y) per symbol via
  `fetchResearchData`; timestamps intersected; insufficient overlap → verdict
  BLOCKED (never extrapolated).
- **Walk-forward**: rolling AND expanding modes; window config
  trainBars=400, validateBars=50, testBars=100, stepBars=100 (bars = daily
  candles); warmup overlap initializes state from TRAIN-tail data only; OOS
  periods are those decided at timestamp ≥ testStart.
- **Costs**: stressMode `adverse` as primary; robustness grid sweeps
  normal/conservative/adverse/extreme. Funding: N/A (see §3).
- **Arms** (one engine, `runPairSpreadSim`, config variants only):
  - M1 classical distance — corr floor + minObs selection, FROZEN β, in-sim gate OFF
  - M2 static cointegration — full conjunctive gate selection, FROZEN β, gate ON
  - M3 dynamic cointegration — full gate + rolling stability rank, ROLLING β, gate ON
  - M4 regime-aware — M3 + regime entry filter (causal injected labels)
- **PRIMARY ARM: M4** (pre-registered). Other arms are comparative evidence
  only; the verdict comes from M4. This prevents post-hoc cherry-picking.
- **Benchmarks**: buy_hold, simple_momentum, simple_mean_reversion averaged
  per-leg over the identical stitched OOS span (random_entry feeds the
  survival baseline).
- **Survival thresholds**: `evaluateSurvival` conjunction (bootstrap CI
  excludes 0, permutation p < 0.05, beats random_entry, walk-forward
  consistency, cross-asset consistency, PBO ≤ ceiling 0.50) AND
  `runSurvivalGate` defaults (minSharpe 0.5, minExpectancy 0, min trades).
- **Verdict rule**: SURVIVED iff both pass on M4 with real fetched data;
  otherwise KILLED with failed checks enumerated verbatim. KILLED is an
  acceptable ship state; fabricating survival is not.

## 3. Deliberate deviations

1. **No PCA/DBSCAN** — universe of 8 majors yields 28 pairs; exhaustive
   pairing is cheap. External source itself calls clustering a reducer, not
   proof of tradability.
2. **Correlation IS a hard gate** — stricter than external (documented in
   `validation.ts`); external treats it as diagnostic only.
3. **M1 uses an OLS-frozen-β proxy for the classical distance method** —
   true distance-method sizing is not implemented; the proxy is the closest
   config variant of the single engine (no second engine allowed).
4. **Benjamini–Hochberg FDR inside the selector = P2 stretch** — verdict-level
   defense (`evaluateSurvival` incl. PBO ceiling) already controls the
   multiple-testing burden; selector-level BH would double-count protection.
5. **Funding = documented N/A** — Binance derivative endpoints (`/fapi/v1/*`)
   return HTTP 403 from this environment (roadmap Known Backlog). Reports
   carry `fundingPct: 0` with an explicit N/A note; spot assumption stated.
6. **Level-price spread convention** — internal spread uses level closes
   (B − β·A), not log prices; cointegration test operates on the same
   convention, keeping gate and simulator consistent.
7. **Baseline convention** — per-leg runs averaged into one comparison row;
   alternative (equal-weight basket series) noted, not used.

## 4. Acceptance checklist

- [x] All 10 external concepts covered in §1 with file-level mapping.
- [x] Every "NEW"/"PARTIAL" item maps to a work step (selection → Step 3,
      stability → Step 2, frozen β + entry filter → Step 4, walk-forward →
      Step 5, round trips/report metrics → Step 6, survival adapters → Step 7,
      benchmarks → Step 8, ablation/robustness → Step 9, verdict → Steps 10–11).
- [x] Protocol frozen in §2 before any real run; primary arm M4 pre-registered.
- [x] Deviations documented in §3 with rationale.
