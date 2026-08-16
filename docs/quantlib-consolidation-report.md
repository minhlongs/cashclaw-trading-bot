# Quantlib Consolidation Report

## Summary

The canonical indicator library at `src/tree/alpha/indicators.ts` contains 12 indicators. Three files contain duplicate or partial indicator implementations that should be consolidated. Two files have no duplicates and are clean.

**Total duplicates found:** 3 files, 4 duplicate functions
**Canonical location:** `src/tree/alpha/indicators.ts`

---

## Duplicate Inventory

| Indicator | Duplicate Location | Lines | Canonical Signature | Duplicate Signature | Differences |
|-----------|-------------------|-------|--------------------|--------------------|-------------|
| SMA | `src/forest/alpha/baselines/runner.ts` | 64-68 | `(candles: IndicatorCandle[], lookback: number, timeframe?) => IndicatorResult` | `(candles: Candle[], end: number, period: number) => number` | **Different:** Takes `end` index instead of full array slice; returns raw `number` not `IndicatorResult`; uses `Candle` type (structurally identical to `IndicatorCandle`) |
| SMA | `src/tree/regime/features.ts` | 62-71 | `(candles: IndicatorCandle[], lookback: number, timeframe?) => IndicatorResult` | `(closes: number[], period: number) => number[]` | **Different:** Takes `number[]` not candles; returns full `number[]` array not single `IndicatorResult`; batch-oriented |
| ATR | `src/forest/alpha/baselines/runner.ts` | 70-75 | `(candles: IndicatorCandle[], lookback: number, timeframe?) => IndicatorResult` | `(candles: Candle[], end: number, period: number) => number` | **Different:** Same `end`-index pattern; returns raw `number`; otherwise algorithm is identical |
| Bollinger | `src/tree/bot/strategies/mean-reversion-indicators.ts` | 15-25 | `(candles: IndicatorCandle[], lookback: number, timeframe?) => IndicatorResult` | `(prices: number[], period: number, stdDev: number) => BollingerBands` | **Different:** Takes `number[]` not candles; returns `{ upper, middle, lower }` object; accepts custom `stdDev` param (canonical uses fixed 2.0) |
| RSI | `src/tree/bot/strategies/mean-reversion-indicators.ts` | 28-57 | `(candles: IndicatorCandle[], lookback: number, timeframe?) => IndicatorResult` | `(prices: number[], period: number, buyThreshold: number, sellThreshold: number) => RSI` | **Different:** Takes `number[]`; returns `{ value, trend }` with label; accepts custom thresholds (canonical uses 30/70) |
| Volume Check | `src/tree/bot/strategies/mean-reversion-indicators.ts` | 59-64 | `volumeZScoreIndicator` (similar purpose) | `(volumes: number[], period: number, multiplier: number) => boolean` | **Different:** Returns boolean vs z-score; threshold-based vs statistical |

---

## Files with NO Duplicates

| File | Status |
|------|--------|
| `src/forest/alpha/baselines/runner.ts` (other functions) | Clean — only SMA and ATR are duplicated |
| `src/tree/regime/classifier.ts` | Uses `atr` variable name but computes from pre-computed features, no function duplication |
| `src/tree/exchange/` (all files) | Clean — no indicator implementations found |
| `src/forest/alpha/pipeline/engine.ts` | Uses `f['rsi']` from pre-computed features, no duplication |

---

## Recommended Migration Order (Safest First)

### Phase 1: Non-Breaking Aliases (Low Risk)
**Files:** `src/tree/regime/features.ts` (lines 62-71)

- The `sma()` function here returns `number[]` (batch mode) which the canonical library does not support
- **Action:** Add a `smaBatch()` helper to canonical library OR keep as-is with a comment noting it is intentionally different
- **Risk:** LOW — regime features are internal computation, not strategy-facing

### Phase 2: Strategy Indicator Consolidation (Medium Risk)
**Files:** `src/tree/bot/strategies/mean-reversion-indicators.ts` (lines 15-64)

- `calculateBB`, `calculateRSI`, `checkVolume` are used by `mean-reversion.ts`
- **Action:** Replace with canonical `bollinger` and `rsi` indicators; adapt call sites
- **Risk:** MEDIUM — live strategy code; needs careful parameter mapping (threshold differences)

### Phase 3: Baseline Runner Consolidation (Low-Medium Risk)
**Files:** `src/forest/alpha/baselines/runner.ts` (lines 64-75)

- `sma()` and `atr()` here use `end`-index pattern for backtest loop efficiency
- **Action:** Create adapter that wraps canonical indicators for the `end`-index pattern, or refactor loop to use slice-based calls
- **Risk:** LOW-MEDIUM — backtest only, deterministic, easy to verify

---

## Risk Assessment

### What Could Break If We Replace Calls

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Parameter mismatch** — canonical RSI uses fixed 30/70 thresholds; mean-reversion may use custom | HIGH | Add threshold parameters to canonical RSI or create wrapper |
| **Return type mismatch** — canonical returns `IndicatorResult` (single value); some duplicates return arrays or objects | MEDIUM | Add batch/array variants to canonical library |
| **Type incompatibility** — canonical uses `IndicatorCandle`; duplicates use `Candle` (structurally identical but different import) | LOW | Both types have identical shape; create type alias or adapter |
| **Performance** — baseline runner uses index-based iteration; wrapping may add overhead | LOW | Baseline is backtest-only; measure before optimizing |
| **Behavioral drift** — subtle algorithm differences (e.g., Bollinger stdDev parameter) | HIGH | Audit each function's math; add parameter support to canonical |

### Specific Concerns

1. **RSI Thresholds**: `mean-reversion-indicators.ts` accepts `buyThreshold`/`sellThreshold` parameters. Canonical `rsiIndicator` hardcodes 30/70. Before replacing, either parameterize canonical or verify strategy always uses 30/70.

2. **Bollinger stdDev**: `calculateBB` accepts custom `stdDev` parameter. Canonical `bollingerIndicator` hardcodes 2.0. Verify strategy always uses 2.0 before consolidating.

3. **SMA Batch Mode**: `features.ts` SMA returns `number[]` for full window. Canonical returns single `IndicatorResult`. Need batch variant or refactor call site.

---

## Canonical Library Coverage

The canonical library at `src/tree/alpha/indicators.ts` covers:

- SMA, EMA, RSI, ATR, Bollinger, MACD (6 core indicators)
- Volume Z-Score, Returns, Log Returns, Momentum, Realized Volatility, Distance from MA (6 advanced indicators)

**Missing from canonical that exist as duplicates:**
- None — all duplicated indicators already have canonical counterparts

**Potential additions needed:**
- Batch/array variants of SMA and ATR for regime features
- Parameterized RSI (thresholds)
- Parameterized Bollinger (stdDev)

---

## Next Steps

1. Review this report with team
2. Decide whether to parameterize canonical indicators or keep duplicate variants
3. Create migration plan with test coverage requirements
4. Execute migration in phases (Phase 1 -> 2 -> 3)
5. Update `src/tree/alpha/indicator-types.ts` if adding batch variants
6. Verify `npm test` passes after each phase
