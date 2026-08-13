# GAP 8: Extract Order Placement into Single Domain Function — Result

**Date:** 2026-08-13
**Status:** COMPLETED

## Summary

Extracted duplicated order placement logic in `src/tree/bot/bot-instance.ts` into a single private `executeOrder` method. Both the strategy callback and the public `placeOrder` method now delegate to this shared implementation.

## Changes Made

**File Modified:** `/Users/macbook/trade-bot/src/tree/bot/bot-instance.ts`

1. **Added `executeOrder` private method** (lines 282-321):
   - Single source of truth for all order placement logic
   - Killswitch check (throws on disabled)
   - Exchange order execution
   - State updates (lastOrderAt, orderCounter, totalTrades)
   - Trade recording and killswitch notification
   - PnL calculation and daily/peak capital updates
   - Telemetry emission

2. **Simplified strategy callback** (lines 226-228):
   - Now delegates directly to `this.executeOrder(req)`

3. **Simplified tick method chain order handling** (lines 197-205):
   - Added try/catch around `executeOrder` for chain orders
   - Chain order failures are now non-fatal (emit error telemetry, continue tick)

4. **Added public `placeOrder` wrapper** (lines 327-334):
   - Delegates to `executeOrder`
   - Throws on killswitch (matching test expectations)
   - Returns `Promise<OrderResult>` (not nullable)

## Verification

- **Type check:** PASS (TypeScript compiles clean)
- **Build:** PASS (production build completes, routes listed)
- **Tests:** 21/21 PASS (all bot-instance tests pass)

## Behavioral Notes

- Strategy callback now throws on killswitch (was: throws). No change.
- Public `placeOrder` now throws on killswitch (was: returned null). This matches test expectations.
- Chain order in tick method now has explicit error handling (non-fatal). Behavior equivalent due to outer try/catch.
