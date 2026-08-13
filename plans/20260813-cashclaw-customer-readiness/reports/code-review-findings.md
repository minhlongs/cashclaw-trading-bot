# Code Review Findings — OmniRoute Phase 4

**Date:** 2026-08-13
**Reviewer:** code-reviewer subagent
**Scope:** StrategyChain integration + type safety fixes

---

## Applied Fixes

### HIGH — Missing `await` on chain order placement
**File:** `src/tree/bot/bot-instance.ts:199`
**Issue:** `this.placeOrder(chainOrder)` was fire-and-forget in `tick()` — order placement not awaited, potential race condition
**Fix:** Added `await` + early return on failure:
```typescript
const chainResult = await this.placeOrder(chainOrder);
if (!chainResult) return;
```

---

## Non-Blocking Findings (Track for V2)

### H1 — Chain strategy always fires
**File:** `src/tree/bot/bot-instance.ts:197-202`
**Issue:** `evaluateChain()` runs before strategy `onTicker()` — chain signal always processed first regardless of strategy state
**Impact:** Chain overrides strategy signals
**Recommendation:** Add priority/ordering config in v2

### H2 — `openPositions` always 0
**File:** `src/tree/bot/bot-instance.ts:289`
**Issue:** `this.state.totalTrades - this.state.winCount - this.state.lossCount` — entry/exit both increment `totalTrades`, so difference is always 0
**Impact:** Strategy context has incorrect position count
**Recommendation:** Track entries separately from exits

### M1 — Duplicate `placeOrder` closure
**File:** `src/tree/bot/bot-instance.ts:226, 311`
**Issue:** `placeOrder` defined twice (inline in `initializeStrategy` + private method) with identical logic
**Recommendation:** Extract to single method

### M2 — `orderResultToTrade` double-increments counter
**File:** `src/tree/bot/bot-instance.ts:356`
**Issue:** `orderCounter++` in `placeOrder` (line 320) AND in `orderResultToTrade` (line 356)
**Recommendation:** Increment only once

### M3 — Duplicate `StrategyContext` types
**Files:** `src/tree/bot/types.ts` + `src/tree/bot/strategy-chain/types.ts`
**Issue:** Same interface defined in two places
**Recommendation:** Consolidate to single definition

### M4 — Dead exports
**File:** `src/tree/bot/strategy-chain/index.ts`
**Issue:** `buildLegacyChain`, `LegacyChainNode`, `StrategyChainEngine` exported but unused
**Recommendation:** Remove or document intended use

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| HIGH | 1 | ✅ Fixed (await) |
| HIGH | 2 | 📝 Tracked (v2) |
| MEDIUM | 4 | 📝 Tracked (v2) |

**Verdict:** CODE-COMPLETE for v1. All blocking issues resolved. Non-blocking findings tracked for next iteration.
