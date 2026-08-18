# Next Phase Plan — Alpha Discovery Campaign

**Date:** 2026-08-18
**Campaign status:** 14/16 hypothesis classes falsified, 5 running (#15-#19)
**Proposed:** 4 new hypothesis classes (#24-#27)

---

## Campaign Assessment: Is More Testing Worth It?

**Short answer: Yes, run 4 more, then reassess.**

Rationale:
- The 5 currently running hypotheses (#15-#19) are moderate-novelty extensions of earlier work. Session-aware mean reversion (#15) and VVOL regime (#16) are genuinely new signal directions, but cross-exchange volume (#17) and correlation regime shift (#19) share DNA with the already-falsified cross-asset and cross-exchange hypotheses.
- The 4 proposed hypotheses below use **different signal sources** (candle microstructure, sequential volume regimes, mean-reversion at sigma extremes, and funding×price interactions). They have not been tested in any form.
- **Total projected hypothesis count after all 26:** ~1800+ parameter configs tested. If all26 classes fail, that is a robust dataset for concluding the campaign.
- After the proposed 4 + the 5 running, recommend a **hard stop** and pivot to non-alpha research (risk management, position sizing, or execution quality) unless any new class shows a clear signal.

**Stopping criteria for the campaign:** If hypotheses #15-#27 (13 classes total) all produce 0/5+ OOS passes, the falsification evidence is conclusive. No more TA/structural hypothesis testing should be pursued at this parameter scale.

---

## Proposed Hypotheses

### #24: Wick Exhaustion Reversal — SOLUSDT 8h

**Core idea:** Large wicks (price rejection within a candle) signal intraday indecision. When multiple consecutive candles show high-wick rejection on the same side, price exhausts and mean-reverts.

**Edge theory:** Market makers and large traders probe for liquidity via wicks. Repeated wick rejection means the market is rejecting that direction. Mean reversion follows.

**Data sources:** OHLCV only (Binance 8h candles, ~730 days)

**Sweep parameters (36 configs):**
| Parameter | Values |
|---|---|
| `wickThreshold` | 0.5, 0.6, 0.7 (wick length / candle range) |
| `lookbackCandles` | 3, 5 (consecutive wick count required) |
| `deviationFromSMA` | 0.02, 0.05 (min price deviation from SMA to trigger) |
| `maxHold` | 6, 12 bars |

**Signal logic:**
1. Compute wick ratio per candle: `wickRatio = max(high-close, close-low) / (high-low)`
2. Count consecutive candles where `wickRatio > wickThreshold`
3. When `consecutive >= lookbackCandles` AND price deviation from SMA exceeds threshold:
   - LONG if wicks are on the downside (price rejecting lower levels)
   - SHORT if wicks are on the upside (price rejecting higher levels)
4. Exit at maxHold OR price reverts to SMA

**Why genuinely different:** All tested TA used price close/open or volume. None used candle wick geometry. Volume-price divergence (#14) uses volume divergence; this uses price rejection geometry. No structural or sentiment signal tested. Completely new data transformation.

---

### #25: Volume Compression Breakout — SOLUSDT 8h

**Core idea:** After a low-volume quiet period, volume expansion breaks out in the prevailing direction. The breakout continues if volume confirms it.

**Edge theory:** Quiet accumulation (compressed volume) is followed by directional expansion. The breakout direction is predictable from the pre-compression price trend. This is a regime-transition signal, not a continuous signal.

**Data sources:** OHLCV only (Binance 8h candles, ~730 days)

**Sweep parameters (32 configs):**
| Parameter | Values |
|---|---|
| `compressionWindow` | 12, 24 bars (lookback to measure volume compression) |
| `compressionThreshold` | 0.5, 0.7 (volume must be < threshold * rolling avg) |
| `expansionMultiplier` | 1.5, 2.0 (volume must be > multiplier * rolling avg) |
| `directionLookback` | 6, 12 bars (use SMA slope over this period for direction) |
| `maxHold` | 6, 12 bars |

**Signal logic:**
1. Rolling volume average over `compressionWindow` bars
2. Detect compression: current volume < `compressionThreshold * rolling avg` for N consecutive bars
3. Detect expansion: current volume > `expansionMultiplier * rolling avg`
4. Direction: SMA slope over `directionLookback` bars (rising = LONG, falling = SHORT)
5. Enter on first expansion bar after compression, exit at maxHold

**Why genuinely different:** Volume-price divergence (#14) tests divergence at a single point in time (price up, volume down). This tests a sequential regime: quiet → loud. No hypothesis tested volume regime transitions. This is a structural market microstructure hypothesis.

---

### #26: Mean Reversion at Sigma Extremes — SOLUSDT 8h

**Core idea:** When price reaches N standard deviations from its SMA, it mean-reverts. The more extreme the deviation, the stronger the reversion signal.

**Edge theory:** Price can only deviate so far from its moving average before reversion. At 2-3 sigma, the probability of mean reversion is statistically significant in most asset classes. In crypto, higher sigma is needed due to fat tails.

**Data sources:** OHLCV only (Binance 8h candles, ~730 days)

**Sweep parameters (36 configs):**
| Parameter | Values |
|---|---|
| `smaPeriod` | 20, 40, 80 bars |
| `deviationSigma` | 1.5, 2.0, 2.5, 3.0 |
| `maxHold` | 6, 12, 24 bars |

**Signal logic:**
1. Compute SMA over `smaPeriod` bars
2. Compute rolling standard deviation of close price over same window
3. z-score = (close - SMA) / rollingStd
4. LONG when z-score < -deviationSigma, SHORT when z-score > deviationSigma
5. Exit at maxHold OR z-score returns to 0

**Why genuinely different:** This is pure statistical mean reversion — a fundamentally different signal from TA momentum (#1), RSI mean reversion (round 1), or regime-based approach (#12). The sigma-threshold approach has not been tested at any parameter scale. It tests whether fat-tailed distributions in crypto create exploitable mean reversion at statistical extremes.

---

### #27: Funding × Price Extreme Interaction — SOLUSDT 8h

**Core idea:** Extreme funding rates alone are noise-tested (#24 funding fade: 0/7 OOS). Extreme price deviations alone are noise-tested (#26 sigma extremes, pending). But the INTERACTION — extreme funding AND extreme price — may isolate forced positioning that unwinds predictably.

**Edge theory:** When funding is extreme (crowded) AND price is far from average (overextended), participants are doubly trapped. The combination is a stronger signal than either alone. This is a compound signal, not a single-signal filter.

**Data sources:** OHLCV + Funding rate history (Binance, 8h intervals, ~730 days)

**Sweep parameters (36 configs):**
| Parameter | Values |
|---|---|
| `fundingThreshold` | 0.0003, 0.0005, 0.0008 (absolute funding rate level) |
| `priceSigma` | 1.5, 2.0, 2.5 (price deviation from SMA, in sigma) |
| `maxHold` | 6, 12, 24 bars |

**Signal logic:**
1. Fetch OHLCV + funding rate history (align to 8h timestamps)
2. Compute SMA and rollingStd for price sigma
3. LONG when funding > fundingThreshold AND z-score > priceSigma (crowded long + price extended up → SHORT; OR crowded short + price extended down → LONG). Wait — direction:
   - funding > threshold (positive = longs paying shorts) AND z-score > priceSigma → SHORT (fade crowded longs at price extreme)
   - funding < -threshold AND z-score < -priceSigma → LONG (fade crowded shorts at price extreme)
4. Exit at maxHold OR funding returns to neutral (< threshold/2)

**Why genuinely different:** Combines two previously-falsified single-signal hypotheses (#24 funding fade + #9 basis trading) into a compound signal. Previous composite tests (#10 sentiment × funding) used sentiment; this uses structural price level. The compound filter may isolate trades that single signals cannot. This tests a genuinely different hypothesis: interactions between derivatives and price signals can be alpha-generating even when individual signals are not.

---

## Implementation Checklist

For each hypothesis (#24-#27):
- [ ] Write backtest script in `src/forest/backtest/`
- [ ] Follow existing pattern: fetchOHLCV + fetchFundingRate (where needed) + param grid + OOS 65/35 + bootstrap CI 1000
- [ ] Pin end date to `2025-09-19` (consistent with existing tests)
- [ ] Report pass criteria: >=5 OOS trades + Sharpe > 0 + CI lo > 0
- [ ] Write results to `plans/reports/`
- [ ] Update master falsification report

## Infrastructure to Reuse

- `src/forest/backtest/cost-model.ts` — `resolveStressConfig`, `applyCosts`
- `src/forest/backtest/data-fetcher.ts` — `fetchOHLCV` (OHLCV for all exchanges)
- `src/forest/backtest/ohlcv.ts` — `Candle` interface
- `src/forest/backtest/cross-exchange-funding.ts` — funding rate fetch functions (inline, reusable pattern)
- `src/forest/backtest/volume-price-divergence.ts` — bootstrap CI pattern

## Data Notes

- OHLCV: ~730 days available for all assets at all intervals
- Funding rate: available via `https://fapi.binance.com/fapi/v1/fundingRate` (8h intervals, ~730 days)
- Open interest: limited to ~60 days (hourly endpoint). NOT used in these hypotheses.
- No new data sources needed. All4 hypotheses use only OHLCV + funding rate.
