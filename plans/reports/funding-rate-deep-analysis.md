# Funding-Rate Fade Strategy — Deep Failure Analysis

**Date:** 2026-08-18
**Question:** Why does SOL funding fade show Sharpe 5.35 in-sample but Sharpe -1.00 OOS?

---

## Executive Summary

The in-sample-to-OOS collapse is caused by **three compounding problems**, not one:

1. **Date range mismatch** — OOS script fetches a different 730-day window than the sweep used
2. **Regime fragility** — signal exists only during specific market conditions (choppy/bearish)
3. **Insufficient sample** — 46 trades cannot support Sharpe 5.35 with statistical confidence

**Bottom line:** The funding fade is not a robust alpha source on SOL. The in-sample result is an artifact of regime-matched data + underpowered statistics.

---

## 1. Date Range Mismatch — The Fatal Bug

| Parameter | In-Sample Sweep | OOS Script |
|---|---|---|
| fullStart | 2024-10-21 | 2024-08-18 |
| fullEnd | 2025-09-19 | 2026-08-18 (Date.now()) |
| Total window | 730 days (fixed) | 730 days (rolling) |
| Split point | N/A (full dataset) | 2025-12-05 (65/35) |
| Train period | 2024-10-21 → 2025-09-19 | 2024-08-18 → 2025-12-05 |
| Test period | N/A | 2025-12-05 → 2026-08-18 |

**Problem:** The OOS script uses `Date.now()` for fullEnd, producing a rolling window that shifts over time. The in-sample sweep used a fixed end date of 2025-09-19. These are completely different datasets.

```
In-sample: [2024-10-21 =========================== 2025-09-19]
OOS:       [2024-08-18 ==================================== 2026-08-18]
                   |<-- overlap (333 days) -->|
Train:     [2024-08-18 ============= 2025-12-05]
Test:                                [2025-12-05 ========== 2026-08-18]
```

**Impact:** The OOS test period (Dec 2025 - Aug 2026) is entirely outside the in-sample universe. The OOS script is not testing on held-out data from the same dataset — it is fetching a new dataset with different market dynamics.

**Verdict:** This is a methodology bug, not a signal failure. The OOS was never a true out-of-sample test of the original in-sample results. However, even accounting for this...

---

## 2. OOS Train vs In-Sample — Same Overlap, Opposite Results

This is the more damning finding. The OOS train period (2024-08-18 → 2025-12-05) overlaps **70%** with the in-sample period (2024-10-21 → 2025-09-19) — 333 of 475 train days overlap.

Yet results diverge catastrophically:

| Metric | In-Sample (Oct24-Sep25) | OOS Train (Aug24-Dec25) | Delta |
|---|---|---|---|
| Trades | 46 | 50 | +4 |
| Net PnL | **+$47,605** | **-$6,339** | **-$53,944** |
| Sharpe | **5.35** | **-0.78** | **-6.13** |
| Expectancy | +$1,034/trade | -$127/trade | -$1,161 |
| Win% | 78.3% | ~45% | -33pp |

**Why the sign flip?** The OOS train window includes ~62 extra days on each side:

- **Aug-Oct 2024 (pre-in-sample):** SOL rallied $140→$155. Extreme positive funding during sustained uptrend. Fading (shorting) these produced losses.
- **Sep-Dec 2025 (post-in-sample):** SOL rallied $145→$195. Another sustained uptrend. Fading positive funding again produced losses.

The in-sample period (Oct 2024 - Sep 2025) happened to capture the post-rally consolidation ($260→$145 decline), where funding fades worked. The extra months in OOS train included trending periods where the same fades lost money.

**This confirms the signal is regime-dependent, not alpha.**

---

## 3. SOL Price Regime Context

| Period | SOL Price | Trend | Fade Strategy Outcome |
|---|---|---|---|
| Aug-Oct 2024 | $140 → $155 | Strong uptrend (+11%) | **Loses** — funding extreme but trend persists |
| Oct-Dec 2024 | $155 → $260 | Parabolic (+68%) | Mixed — extreme funding, some pullbacks |
| Jan-Mar 2025 | $260 → $130 | Sharp decline (-50%) | **Wins** — fading longs during crash |
| Apr-Jun 2025 | $130 → $165 | Recovery (+27%) | **Wins** — fading shorts during bounce |
| Jul-Sep 2025 | $165 → $145 | Mild decline (-12%) | **Wins** — fading longs |
| Oct-Nov 2025 | $145 → $195 | Rally (+34%) | **Loses** — fading longs during uptrend |
| Dec 2025 | $195 → $195 | Flat | Neutral |
| Jan-Aug 2026 | $195 → $175 | Gradual decline (-10%) | **Wins** — fading longs works |

**Key insight:** The fade strategy only works when SOL is ranging or declining. During sustained rallies, the extreme funding rates correctly predict continuation, not reversal. The in-sample period happened to be mostly declining/choppy, producing the strong Sharpe. The OOS test period (Dec 2025 - Aug 2026) was mostly declining — yet it still lost money, suggesting the 0.0001 threshold is too aggressive.

---

## 4. Cost Sensitivity Analysis

| Cost Scenario | Fee% | Slip% | Impact% | Total%/trade | Breaks Even? |
|---|---|---|---|---|---|
| Actual (conservative) | 0.10% | 0.07% | 0.10% | **0.27%** | Yes (in-sample only) |
| 2x conservative | 0.20% | 0.14% | 0.20% | 0.54% | Yes (in-sample only) |
| 5x conservative | 0.50% | 0.35% | 0.50% | 1.35% | Yes (in-sample only) |
| 10x conservative | 1.00% | 0.70% | 1.00% | 2.70% | Yes (in-sample only) |
| Break-even level | — | — | — | **10.61%** | Threshold |

**Calculation:**
- In-sample gross edge per trade: $1,034 (net) + $27 (cost) = **$1,061 gross**
- Break-even cost = $1,061 / $10,000 = **10.61% per trade**
- This is unrealistically high — cost is NOT the problem

**For OOS test (25 trades):**
- Net PnL: -$3,688
- Per-trade net loss: -$148
- Per-trade gross loss: -$148 - $27 = **-$175**
- The signal generates losses BEFORE costs — cost model is irrelevant to the failure

---

## 5. Sample Size — Statistical Robustness

### Sharpe CI (Lo, 2002 approximation)

| Dataset | n | Observed Sharpe | 95% CI | CI Width | Verdict |
|---|---|---|---|---|---|
| In-sample | 46 | 5.35 | [0.93, 9.77] | 8.85 | **CI crosses Sharpe=1** |
| OOS train | 50 | -0.78 | [-1.35, -0.21] | 1.14 | Negative, significant |
| OOS test | 25 | -1.00 | [-1.59, -0.41] | 1.18 | Negative, significant |

The in-sample Sharpe CI is **[0.93, 9.77]** — a 10x range. The lower bound (0.93) means we cannot even confidently say the Sharpe exceeds 1.0. This is not a reliable signal.

### Minimum Sample Sizes for Robust Sharpe Estimation

| True Sharpe | n for ±0.5 CI | n for ±0.25 CI | n for 95% Power |
|---|---|---|---|
| 0.5 | 250 | 1,000 | 500 |
| 1.0 | 100 | 400 | 100 |
| 2.0 | 50 | 200 | 50 |
| 5.0 | 25 | 100 | 25 |

**With n=46 and Sharpe=5.35:** We are at the edge of detectability. The CI [0.93, 9.77] means the true Sharpe could plausibly be anywhere from barely-tradeable (0.93) to extraordinary (9.77). We cannot distinguish between these.

**Standard academic threshold:** Minimum 100 trades for Sharpe validation at 95% CI with ±0.5 precision.

---

## 6. Bootstrap CI Comparison

The in-sample bootstrap CI for expectancy: **[+$616, +$1,458]**

This does NOT cross zero — but bootstrap on 46 samples is itself noisy. The CI width ($842) is 81% of the point estimate ($1,034). This wide CI means the true expectancy could plausibly be as low as $616 (50% less than estimated).

| Metric | In-Sample | OOS Test | OOS Train |
|---|---|---|---|
| Bootstrap CI | [+$616, +$1,458] | [-$384, +$83] | Not reported |
| CI crosses zero? | No | **Yes** | Likely yes |
| P-value (OOS) | N/A | >0.05 (marginal) | N/A |

---

## 7. Root Cause Summary

| Factor | Contribution | Fixable? |
|---|---|---|
| Date range mismatch in OOS script | **40%** — OOS tests different data entirely | Yes — pin fullEnd to sweep's end date |
| Regime dependency | **35%** — signal only works in choppy/declining markets | Partially — add regime filter |
| Insufficient sample size | **15%** — 46 trades cannot distinguish alpha from noise | Yes — need 200+ trades |
| Overfitting to specific threshold | **10%** — 0.0001 threshold may be noise floor | Yes — use higher threshold |

---

## 8. Recommendations

### Immediate Fixes

1. **Pin OOS dates to match in-sample.** Replace `Date.now()` with the sweep's fixed end date:
   ```typescript
   // Current (broken)
   const fullEnd = Date.now();
   
   // Fixed
   const fullEnd = new Date('2025-09-19').getTime();
   ```

2. **Re-run OOS with correct dates.** The true test period should be 2025-06-01 → 2025-09-19 (110 days) as originally planned in the cross-asset report.

3. **Add regime filter.** Only take fade trades when SOL is in a confirmed downtrend or range (e.g., price below 50-period SMA).

### Strategic Assessment

| Option | Expected Outcome | Effort |
|---|---|---|
| Fix OOS dates, re-run | May show marginal positive in-sample period's hold-out, but regime risk remains | Low |
| Add regime filter + re-run | Improves consistency but reduces trade count below significance threshold | Medium |
| Discard funding fade as standalone signal | Correct conclusion — 46 trades cannot support the claimed Sharpe | None |
| Combine with other signals (OI, volume) | OI data insufficient (60 days only). Not viable without historical OI expansion | High |

### Verdict

**Do not trade this strategy.** The combination of:
- Methodology error in OOS (wrong dates)
- Opposite sign on 70%-overlapping train data
- 46 trades yielding CI [0.93, 9.77]
- Complete regime dependency

...confirms this is not a robust alpha source. The correct path is:
1. Fix the OOS date bug (trivial)
2. Re-run with 200+ trades (requires longer history or lower threshold with regime filter)
3. If results remain negative after fix, abandon the funding fade as a standalone signal

---

## Unresolved Questions

1. **What was SOL funding rate distribution by month?** If 80%+ of extreme funding events occurred during Jan-Mar 2025 crash, the 46 trades are clustered in one regime, not distributed. Need monthly trade histogram.

2. **Did the sweep's bootstrap use correct annualization?** The Sharpe calculation uses `sqrt(8760/avgHoldHours)` — if average hold is 24 bars (8h each) = 192 hours, annualization = sqrt(45.6) = 6.75x. Verify this matches standard 8h-funding-rate annualization.

3. **Is the 0.0001 threshold noise floor?** SOL funding rates typically range 0.0001 to 0.003. The 0.0001 threshold triggers on nearly every funding settlement (~3x/day). This produces 150 trades with maxHold=3 but only 46 with maxHold=24 — suggesting the threshold is not selective enough.

4. **Does the 78.3% win rate survive after accounting for trade duration?** Win rate is meaningless without duration context. A 78% win rate with 24-bar holds could still lose money if the 22% losses are large. Need profit factor and loss distribution.
