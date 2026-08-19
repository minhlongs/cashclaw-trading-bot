# Next-Phase Investigation: Funding x Price Extreme Interaction

**Date:** 2026-08-18
**Status:** FALSIFIED (CLOSED)

> **Closure note (2026-08-19):** This plan is superseded. Phase 1 was executed (commit `808e40b`); the candidate was falsified across 6 walk-forward windows (10/162 OOS passes = 6%, aggregate PnL -$455,090). Per the plan's own Phase 6 decision framework, this is a NO-GO. All 24 hypothesis classes tested across the falsification campaign show zero persistent OOS positive expectancy. Signal space on OHLCV/funding/OI data is exhausted.

---

# Next-Phase Investigation: Funding x Price Extreme Interaction (CLOSED)
**Candidate:** Hypothesis #24 (renumbered from #27)
**Script:** `src/forest/backtest/funding-price-extreme-interaction.ts`

---

## Reframed Problem

The Funding x Price Extreme Interaction strategy produced 12/27 OOS passes on SOL 2025-09-19, but only 5-10 trades per config (below the 30-trade bootstrap threshold). On different OOS windows (SOL 2024-09-19, ETH 2025-09-19) the signal either disappears or is weak. A single 65/35 train/test split is insufficient to distinguish real alpha from overfitting or regime-luck.

**The real question is not "does this strategy work?" but "can we accumulate enough evidence to make a confident go/no-go decision?"** We need to solve the trade-count problem first, then test robustness across time and parameters.

**Goals:**
1. Accumulate 30+ OOS trades across multiple walk-forward windows
2. Test whether the signal survives across different market regimes
3. Verify parameter robustness (not fragile to small changes)
4. Compare against realistic baselines (Buy&Hold, Random Entry)
5. Reach a definitive go/no-go verdict

**Non-goals:**
- Building a production trading system
- Optimizing parameters further
- Paper-trading setup

---

## Key Insight: Data Availability Constraints

The existing `fetchFunding` function in the candidate script only fetches funding from Binance `fapi.v1` API. SOL futures data starts around 2020-09. With 8h candles, 730 days yields ~2,190 candles and ~2,190 funding periods.

For walk-forward windows, we need to maximize the total test period length while keeping each window's train period long enough to produce a reasonable model. The constraint is:
- Each OOS window needs at least 10 candles to generate any trades (signal frequency ~1 per 15-40 candles)
- We need 30+ total OOS trades across all windows
- Total lookback for the deepest window must fit within available data (max ~730 days / ~2190 candles)

---

## Walk-Forward Window Design

### Option A: Rolling 2Y Train / 1Y Test (3 windows)
```
Window 1: Train [0, 730]   | Test [730, 1095]
Window 2: Train [183, 912] | Test [912, 1275]
Window 3: Train [365, 1095]| Test [1095, 1460]
```
**Problem:** Requires 1460 days of data (4 years) but Binance SOLUSDT futures only have ~1500+ days available. This is tight but feasible if we extend the lookback to ~1600 days. At 8h that is ~4800 candles.

### Option B: Rolling 1.5Y Train / 6M Test (4 windows, safer)
```
Window 1: Train [0, 548]   | Test [548, 730]
Window 2: Train [183, 730] | Test [730, 912]
Window 3: Train [365, 912] | Test [912, 1095]
Window 4: Train [548, 1095]| Test [1095, 1277]
```
Requires ~1277 days (~3.5 years). More windows, more OOS trades, more robust.

### Option C: Expanding Window (maximum data use)
```
Window 1: Train [0, 365]     | Test [365, 548]
Window 2: Train [0, 548]     | Test [548, 730]
Window 3: Train [0, 730]     | Test [730, 912]
Window 4: Train [0, 912]     | Test [912, 1095]
Window 5: Train [0, 1095]    | Test [1095, 1277]
```
Maximum data use but early windows have short training periods.

**Recommendation:** Option B (Rolling 1.5Y/6M). It balances training data quality with OOS coverage. Each window has 548 days of training (~1644 candles), which is enough for the SMA40 to stabilize and for the strategy's 27 configs to produce meaningful results. With 4 windows of 182 days each, we should get 4x the current trade count per config.

If the 730-day lookback from the original script is the hard limit (API constraints), we use Option C instead, which still gives 5 windows of 182-day tests.

---

## Work Plan

### Phase 1: Build the Walk-Forward Validation Script

**File:** `src/forest/backtest/funding-price-extreme-walkforward.ts`

**What it does:**
1. Fetch 1277+ days of SOLUSDT 8h candles + funding rates (extend `LOOKBACK_DAYS` from 730 to 1400)
2. Run the 27-config grid across 4 rolling windows (Option B)
3. For each window x config:
   - Train on 548-day window
   - Test on 182-day window
   - Record: trades, PnL, Sharpe, winRate, maxDrawdown, CI
4. Aggregate across windows: total OOS trades, overall Sharpe, CI
5. Pass criteria per window: Sharpe > 0 AND CI lower bound > 0
6. Report: per-window + aggregated + per-config stability

**Key design decisions:**
- Reuse `fetchOHLCV` from `data-fetcher.ts` and `fetchFunding` pattern from the existing candidate
- Reuse `resolveStressConfig`, `applyCosts` from `cost-model.ts`
- Keep the same `runBacktest` logic from the candidate (SMA40 z-score + funding threshold)
- Adapt `bootstrapCI` to use block length proportional to the OOS window size
- Use `computeMetrics` from the candidate (already handles Sharpe, winRate, profitFactor)

**Acceptance criteria:**
- Script compiles with `npx tsx` without errors
- Produces a markdown report with per-window + aggregated tables
- Total OOS trades across all windows >= 15 (target 30+)
- Report includes pass/fail per window per config

**Agent:** `fullstack-developer` for implementation

---

### Phase 2: Parameter Robustness (Perturbation Analysis)

**File:** Extend `funding-price-extreme-walkforward.ts` or add a new section

**What it does:**
1. Take the top 5 passing configs from Phase 1
2. For each config, generate 8 perturbed variants:
   - fundThr: +/- 20%, +/- 50%
   - priceSig: +/- 0.25, +/- 0.5
   - maxHold: +/- 2, +/- 4
3. Run each perturbed config through the same walk-forward windows
4. Measure: what fraction of perturbations still pass OOS?

**Interpretation:**
- If 7/8 perturbations pass: signal is robust (high confidence)
- If 5/8 perturbations pass: signal is somewhat fragile
- If 2/8 or fewer pass: signal is overfit (falsified)

**Acceptance criteria:**
- Perturbation grid: 5 configs x 9 variants (original + 8 perturbations) = 45 configs total
- Report shows pass-rate per original config
- Clear fragility score

**Agent:** `fullstack-developer` for implementation

---

### Phase 3: Regime-Conditioned Analysis

**File:** Extend `funding-price-extreme-walkforward.ts` or add a new section

**What it does:**
1. For each passing config + window, classify the regime at each trade entry using `RuleBasedRegimeClassifier` + `extractRegimeFeatures`
2. Build a regime-to-performance table: which regimes produce positive PnL?
3. Identify: does the signal only work in specific regimes?
4. If regime-specific, quantify: what fraction of OOS time is spent in that regime?

**Implementation approach:**
- Reuse `RuleBasedRegimeClassifier` from `@/tree/regime/classifier`
- Reuse `extractRegimeFeatures` from `@/tree/regime/features`
- For each trade in each OOS window, call `extractRegimeFeatures` at the entry candle index
- Classify the regime and attach it to the trade
- Aggregate PnL by regime

**Acceptance criteria:**
- Regime breakdown table in report
- Identification of "where does this signal actually work?"
- If signal works in only 1 regime with <30% of OOS time, flag as regime-specific (not broadly robust)

**Agent:** `fullstack-developer` for implementation

---

### Phase 4: Baseline Comparison

**File:** Extend the walk-forward script or create `src/forest/backtest/funding-price-extreme-baselines.ts`

**What it does:**
For each OOS window, run:
1. **Buy & Hold:** Simple buy at window start, sell at window end
2. **Random Entry:** Entry at random candle indices, hold for random duration (Monte Carlo, 1000 runs)
3. **Simple Momentum:** Buy if price > SMA, sell if price < SMA
4. **Mean Reversion:** Buy if RSI < 30, sell if RSI > 70

Compare per-window PnL, Sharpe, maxDrawdown of the candidate against these baselines.

**Implementation approach:**
- Reuse `runBaseline` from `@/forest/alpha/baselines/runner` for Buy&Hold and Random Entry
- Implement simple momentum/mean-reversion inline (or use existing implementations from `baseline-compare.ts`)
- Run on the same OOS candle slices as the candidate

**Acceptance criteria:**
- Side-by-side comparison table per window
- Candidate must beat Random Entry on Sharpe (random is ~0) to be worth pursuing
- Candidate should beat or match Buy&Hold to justify the complexity

**Agent:** `fullstack-developer` for implementation

---

### Phase 5: Trade Count Sufficiency Analysis

**What it does:**
1. Calculate: given the observed win-rate and per-trade PnL variance, how many OOS trades are needed for the bootstrap CI to be reliable?
2. Method: bootstrap power analysis
   - Simulate trade PnL distributions from the observed data
   - Vary N from 5 to 100
   - For each N, compute the fraction of bootstrap resamples where CI lower bound > 0
   - Find the N where this fraction stabilizes (>95% of resamples give consistent CI)
3. Report: current trade count vs. required trade count

**Acceptance criteria:**
- Clear answer: "N=XX trades needed for reliable CI at 95% confidence"
- Comparison with actual OOS trade count
- If required N > actual N: flag as insufficient evidence

**Agent:** Can be part of the walk-forward script or a separate analysis section

---

### Phase 6: Go/No-Go Decision Framework

**Decision criteria (concrete thresholds):**

| Criterion | GO | CONDITIONAL | NO-GO |
|---|---|---|---|
| OOS trades (total across windows) | >=30 | 15-29 | <15 |
| Pass rate (% of configs passing all windows) | >=50% | 20-49% | <20% |
| Parameter robustness (perturbation pass rate) | >=7/9 | 5-9 | <5 |
| Baseline comparison (Sharpe vs Random) | Sharpe > 1.0 | Sharpe 0.3-1.0 | Sharpe <= 0.3 |
| Regime breadth | Works in 2+ regimes | Works in 1 regime | No regime dominance |
| CI stability (lower bound > 0 in >90% of bootstrap resamples) | Yes | Marginal | No |

**Scoring:**
- GO: 5+ criteria at GO level, none at NO-GO
- CONDITIONAL: 3-4 criteria at GO, at most 1 at NO-GO
- NO-GO: 2+ criteria at NO-GO level, or critical failures (OOS trades < 15, or Sharpe <= 0)

---

## Agent Recommendations

| Step | Agent | Rationale |
|---|---|---|
| Phase 1: Walk-forward script | `fullstack-developer` | Complex implementation, needs TypeScript + API + data pipeline |
| Phase 2: Perturbation analysis | `fullstack-developer` | Extends Phase 1 script |
| Phase 3: Regime analysis | `fullstack-developer` | Integrates regime classifier with existing backtest |
| Phase 4: Baseline comparison | `fullstack-developer` | Reuses existing `runBaseline` infrastructure |
| Phase 5: Trade count analysis | `fullstack-developer` | Statistical analysis, part of main script |
| Phase 6: Verdict | `suntzu` | Reviewer/evaluator role — pass/fail decision |

**Execution order:** Phases 1-4 can be implemented in a single script. Phase 5 is analysis on the output. Phase 6 is a review gate.

---

## Risks and Gates

### Risk 1: API Data Limitation
Binance SOLUSDT futures funding data may not extend back far enough for 4 rolling windows of 548+182 days.
- **Mitigation:** Fall back to Option C (expanding window) with 5 shorter windows. If even that fails, use ETHUSDT or BTCUSDT which have longer history.
- **Gate:** Script must successfully fetch data for at least 3 windows before proceeding.

### Risk 2: Signal Disappears Across All Windows
The original signal may have been pure overfitting to the 2025-09-19 OOS window.
- **Mitigation:** This IS the purpose of the test. If the signal disappears, we falsify and move on.
- **Gate:** If 0/4 windows pass, declare NO-GO and stop.

### Risk 3: Insufficient Trade Count Even with Multiple Windows
The strategy's trade frequency may be too low for statistical significance.
- **Mitigation:** Reduce `maxHold` to increase trade frequency, or lower `fundingThreshold` slightly. But these changes must be tested in the perturbation analysis.
- **Gate:** Total OOS trades < 15 across all windows = insufficient evidence.

### Risk 4: Regime Lock
The signal works only in one regime that happened to dominate one window.
- **Mitigation:** Regime-conditioned analysis (Phase 3) explicitly tests this.
- **Gate:** If signal works in only 1 regime with <30% OOS time = regime-specific, not broadly robust.

---

## What to Avoid

1. **Do not optimize parameters further.** The current 27-config grid is sufficient. Further optimization on in-sample data will increase overfitting risk.
2. **Do not use the existing `walkforward.ts` directly.** It expects `BacktestResult` type which requires full equity curves and trade logs. The candidate uses its own `Trade`/`Metrics` types. Adapt the windowing logic, not the type system.
3. **Do not skip cost modeling.** Use `conservative` stress config (17 bps total) as the candidate already does.
4. **Do not use future data.** The existing `extractRegimeFeatures` is already causal (annotated in source). Ensure all funding rate lookups are also causal.
5. **Do not make go/no-go decisions based on in-sample performance.** Only OOS metrics matter.
6. **Do not extend to other assets (ETH, BTC) until SOL is confirmed.** Cross-asset testing is a follow-up, not this phase.

---

## Ship Plan

### Step 1: Implement `funding-price-extreme-walkforward.ts`
- Fetch 1400 days of data (SOLUSDT 8h + funding)
- Implement rolling window logic (4 windows, 548 train / 182 test)
- Run 27-config grid through all windows
- Bootstrap CI per window, aggregated CI across windows
- Regime classification at each trade entry
- Parameter perturbation for top 5 configs
- Baseline comparison (Buy&Hold + Random Entry per window)
- Trade count sufficiency analysis
- Markdown report with all tables

### Step 2: Run and analyze
- Execute the script
- Read the report
- Apply the go/no-go framework

### Step 3: Verdict
- If GO: proceed to paper-trading simulation
- If CONDITIONAL: identify specific follow-up tests needed
- If NO-GO: falsify candidate, document findings

---

## Success Metrics

- [ ] Script compiles and runs end-to-end
- [ ] Data fetched for 4 rolling windows (1400+ days)
- [ ] Total OOS trades reported across all windows
- [ ] Per-window pass/fail with bootstrap CI
- [ ] Parameter robustness scores for top configs
- [ ] Regime breakdown table
- [ ] Baseline comparison table
- [ ] Trade count sufficiency analysis
- [ ] Clear go/no-go recommendation

---

## Assumptions

1. **Binance SOLUSDT futures have ~1500+ days of data available.** If not, fall back to expanding window. Confidence: high (SOL futures launched 2020-09).
2. **The existing `fetchOHLCV` caching works reliably.** Confidence: high (tested in `ohlcv-cache.test.ts`).
3. **Funding rate data from Binance `fapi/v1/fundingRate` is available for the full 1400-day range.** Confidence: medium (API may have pagination limits).
4. **The SMA40 period and rolling window are appropriate for the extended data range.** Confidence: high (SMA40 on 8h = 13.3 days, which is a reasonable lookback for crypto funding cycles).
5. **30 OOS trades across 4 windows is achievable.** Current rate: 5-10 trades per 365-day window. 4 windows of 182 days = ~2.5-5.5 trades per window = ~10-22 total. This may fall short of 30. Confidence: medium. If we fall short, we may need to extend to 5-6 windows (Option C) or increase the test period.
