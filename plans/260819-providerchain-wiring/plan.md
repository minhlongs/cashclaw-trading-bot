---
title: "Wire ProviderChain into ExchangeOrchestrator"
description: "Bridge PaperExchangeProvider to TickerProvider/OrderProvider interfaces, route orchestrator calls through ProviderChain, propagate provenance metadata"
status: completed
priority: P2
effort: 3h
branch: main
tags: [provider-chain, orchestrator, provenance, paper-mode]
created: 2026-08-19
---

## Context

Three incompatible provider interfaces exist:
1. **ExchangeAdapter** (`src/tree/exchange/types.ts:75`) — `fetchTicker(symbol)`, no ProviderResult wrapper
2. **TickerProvider & OrderProvider** (`src/tree/exchange/provider/provider.ts:29-35`) — `fetchTicker(symbol)` returns `ProviderResult<Ticker>`, requires `name`, `circuitBreaker`, `healthCheck()`
3. **PaperExchangeProvider** (`src/tree/exchange/provider/paper-provider.ts:16`) — `fetchTicker(exchangeId, symbol)` takes exchangeId as first arg, returns raw `Ticker`

ExchangeOrchestrator currently calls PaperExchangeProvider directly. ProviderChain exists but is unused. The goal: route orchestrator calls through ProviderChain to get fallback support and provenance metadata.

## Interface Gap Analysis

| Requirement | PaperExchangeProvider | TickerProvider/OrderProvider | Gap |
|---|---|---|---|
| `fetchTicker` signature | `(exchangeId, symbol) -> Ticker` | `(symbol) -> ProviderResult<Ticker>` | exchangeId param + ProviderResult wrapper |
| `placeOrder` signature | `(exchangeId, req) -> OrderResult` | `(req) -> ProviderResult<OrderResult>` | exchangeId param + ProviderResult wrapper |
| `name` property | `id: string` (format `provider:X:Y`) | `name: string` | Rename/alias |
| `circuitBreaker` property | `breaker: CircuitBreaker` (private) | `circuitBreaker: CircuitBreaker` | Expose via getter |
| `healthCheck()` method | missing | `healthCheck(): Promise<boolean>` | Delegate to `!isUnhealthy()` |

## Consumer Analysis (no changes needed)

These consumers call PaperExchangeProvider-specific methods via `orchestrator.getProvider()`:
- `src/forest/dashboard/exchange-health.ts:29-44` — `getHealth()`, `getBudget()`, `isCircuitOpen()`, `getBackoffMs()`
- `src/forest/bot/scheduler.ts:54-58` — `isCircuitOpen()`

Both use `ExchangeProvider` interface methods. Orchestrator will keep `providers` map for health access; only execution routes through ProviderChain.

## Phases

### Phase 0: Fix TickerProvider/OrderProvider interface (provider.ts) — REQUIRED PRE-STEP

**Goal:** Make `TickerProvider`/`OrderProvider` return raw types so `ProviderChain.execute` does the wrapping (fixes double-wrap C1).

**File:** `src/tree/exchange/provider/provider.ts`

**Change:** Update the two interfaces to return raw types:
```typescript
export interface TickerProvider extends Provider {
  fetchTicker(symbol: string): Promise<Ticker>;          // was: Promise<ProviderResult<Ticker>>
}
export interface OrderProvider extends Provider {
  placeOrder(req: OrderRequest): Promise<OrderResult>;    // was: Promise<ProviderResult<OrderResult>>
}
```

**Why:** `ProviderChain.execute<T>(fn)` wraps `fn`'s return value in `ProviderResult<T>`. If the provider returns `ProviderResult<Ticker>`, the result is `ProviderResult<ProviderResult<Ticker>>` — double-wrapped, `data` is a ProviderResult not a Ticker. Raw returns make `chain.execute(p => p.fetchTicker(symbol))` produce `ProviderResult<Ticker>` correctly.

**Verification:** Existing `provider.test.ts` mocks return raw values (`{ ok: true }`, `{ symbol, last }`) and assert on `result.ok`/`result.data`/`result.provenance` — all still pass. No test asserts the interface return type.

### Phase 1: PaperProviderAdapter (new file: paper-provider-adapter.ts)

**Goal:** Bridge PaperExchangeProvider to `TickerProvider & OrderProvider`.

**File:** `src/tree/exchange/provider/paper-provider-adapter.ts` (NEW — correctness-driven split; paper-provider.ts is 198 lines and adding the adapter would exceed the 200-line rule M1)

The adapter:
- Implements `TickerProvider & OrderProvider` (import from `./provider`)
- Constructor takes `(provider: PaperExchangeProvider, exchangeId: ExchangeId)`
- `name` = `provider.id`
- `circuitBreaker` = `provider.getCircuitBreaker()`
- `healthCheck()` = `!provider.isUnhealthy()`
- `fetchTicker(symbol)` = returns `Promise<Ticker>` — calls `provider.fetchTicker(exchangeId, symbol)` and **throws on error** (does NOT wrap in ProviderResult; ProviderChain does the wrapping)
- `placeOrder(req)` = returns `Promise<OrderResult>` — same pattern, throws on error

**Steps:**
1. Add `getCircuitBreaker(): CircuitBreaker` method to `PaperExchangeProvider` (after `isCircuitOpen()` at line 197). Do NOT change `private breaker` — use a getter.
2. Create `paper-provider-adapter.ts` with the `PaperProviderAdapter` class.
3. Export `PaperProviderAdapter` from barrel (`src/tree/exchange/provider/index.ts`).

**Success:** `PaperProviderAdapter` satisfies `TickerProvider & OrderProvider`. `chain.execute(p => p.fetchTicker(symbol))` returns `ProviderResult<Ticker>` with `data: Ticker`.

**Risk:** Low — additive, no existing methods modified.

### Phase 2: Orchestrator wiring (exchange-orchestration/index.ts)

**Goal:** ExchangeOrchestrator routes execution through ProviderChain.

**File:** `src/land/exchange-orchestration/index.ts`

**Changes:**
1. Import `ProviderChain`, `PaperProviderAdapter`, `ProviderResult` from `@/tree/exchange/provider`.
2. Add `private chains: Map<string, ProviderChain> = new Map()` alongside existing `providers` map.
3. Add `private lastProvenance: Map<string, ProviderResult<Ticker | OrderResult>> = new Map()` (typed union, not `unknown` — M2 fix).
4. Update `registerProvider(exchangeId, provider)`:
   - Store provider in `this.providers` (unchanged, for health access).
   - Create `PaperProviderAdapter(provider, exchangeId as ExchangeId)`.
   - Create `ProviderChain({ primary: adapter })`.
   - Store chain in `this.chains`.
5. Update `getOrCreateProvider` (private):
   - After creating PaperExchangeProvider, also create adapter + chain.
   - Store in both maps.
6. Rewrite `fetchTicker`:
   - Get chain from `this.chains`.
   - Call `chain.execute(p => p.fetchTicker(symbol))`.
   - Store result in `lastProvenance`.
   - If `chainResult.ok === false`: call `this.reportError(new Error(chainResult.error), 'fetchTicker/${symbol}')` (C3 fix — preserves existing error reporting).
   - Return `ok(chainResult.data)` or `err(chainResult.error)`.
7. Rewrite `placeOrder`:
   - Same pattern: chain.execute, store provenance, unwrap.
   - Killswitch check BEFORE chain.execute (unchanged).
   - Circuit-open check BEFORE chain.execute (unchanged — checks `provider.isCircuitOpen()` from providers map).
   - If `chainResult.ok === false`: call `this.reportError(new Error(chainResult.error), 'placeOrder/${request.symbol}')`.
8. Rewrite `fetchOrderBook`, `fetchOrder`, `cancelOrder`, `fetchBalances`:
   - **fetchOrderBook** and **cancelOrder** and **fetchOrder** are NOT on TickerProvider/OrderProvider interfaces. These remain as direct provider calls (YAGNI — no ProviderChain for methods that ProviderChain doesn't support).
   - Only `fetchTicker` and `placeOrder` go through ProviderChain.
9. **selectHealthyProvider**: Remove from acceptance criteria (M3 — zero callers in codebase, polishing dead code violates YAGNI). Keep existing no-op implementation unchanged. Do NOT add circuit-state check (L1 — `isUnhealthy()` already covers it).
10. Update `destroy()`: clear both maps.
11. Add `getLastProvenance(exchangeId: string): ProviderResult<Ticker | OrderResult> | undefined` public method.
12. Update `getProvider` return type — keep returning `PaperExchangeProvider | undefined` (consumers need ExchangeProvider methods).

**Test mock fix (C2):** Update `makeMockProvider()` in `index.test.ts` and `mkProvider()` in `orchestration-extended.test.ts` to include adapter-required properties:
```typescript
{
  id: 'provider:binance:paper',
  name: 'binance',
  circuitBreaker: { getState: () => 'closed' as const },
  healthCheck: () => Promise.resolve(true),
  // ... existing fetchTicker, placeOrder, etc.
}
```
This is required because `registerProvider` now wraps the provider in `PaperProviderAdapter`, which calls `provider.getCircuitBreaker()` and reads `provider.id`.

**Success:** fetchTicker and placeOrder route through ProviderChain. Other methods unchanged. All existing test assertions hold (mock providers have the same shape, plus adapter-required properties).

**Risk:** Medium — orchestrator method signatures don't change, but internal wiring does. The `placeOrder` circuit-open check at line 102 uses `provider.isCircuitOpen()` — this still works because we keep the providers map.

### Phase 3: Provenance propagation

**Goal:** Consumers can access ProviderChain provenance metadata.

This is already handled by Phase 2 step 11 (`getLastProvenance`). No additional file changes needed.

**Verification:** Add one test in Phase 4 confirming provenance is stored after fetchTicker/placeOrder.

### Phase 4: Test updates

**Files to modify:**
- `src/land/exchange-orchestration/index.test.ts` — update `makeMockProvider()` to include adapter-required properties (C2 fix). Add test for `getLastProvenance` after `fetchTicker`.
- `src/land/exchange-orchestration/orchestration-extended.test.ts` — update `mkProvider()` similarly. Add test for `getLastProvenance` after `placeOrder`. Verify `reportError` called on chain failure (C3).
- `src/tree/exchange/provider/paper-provider-adapter.test.ts` — NEW: test adapter satisfies TickerProvider & OrderProvider, throws on error, exposes correct name/circuitBreaker/healthCheck.

**New tests to add:**
- In `paper-provider-adapter.test.ts`: adapter wraps fetchTicker, throws on provider error, exposes `name`/`circuitBreaker`/`healthCheck`.
- In `index.test.ts`: `getLastProvenance` returns metadata after `fetchTicker`.
- In `index.test.ts`: `getLastProvenance` returns metadata after `placeOrder`.

**NOT changing:**
- `paper-provider.test.ts` — PaperExchangeProvider interface unchanged.
- `paper-provider-extended.test.ts` — same.
- `provider.test.ts` — ProviderChain tests unchanged (raw return types still pass).

### Phase 5: Quality gate

- `npm run build` — 0 TS errors
- `npm test` — all 1880+ tests pass
- `npx eslint src/land/exchange-orchestration/ src/tree/exchange/provider/` — 0 new warnings
- Manual check: no `:any` types added

## Data Flow (after wiring)

```
BotInstance.tick()
  -> ExchangeOrchestrator.fetchTicker(exchange, symbol)
    -> ProviderChain.execute(fn)
      -> PaperProviderAdapter.fetchTicker(symbol)
        -> PaperExchangeProvider.fetchTicker(exchangeId, symbol)
          -> PaperExchange.fetchTicker(exchangeId, symbol)
      <- ProviderResult<Ticker> { ok, data, provenance }
    <- Result<Ticker> (unwrapped, provenance stored)
```

## File Ownership

| File | Phase | Change Type |
|---|---|---|
| `src/tree/exchange/provider/provider.ts` | 0 | Change TickerProvider/OrderProvider return types to raw |
| `src/tree/exchange/provider/paper-provider.ts` | 1 | Add `getCircuitBreaker()` getter |
| `src/tree/exchange/provider/paper-provider-adapter.ts` | 1 | NEW: PaperProviderAdapter class |
| `src/tree/exchange/provider/index.ts` | 1 | Add PaperProviderAdapter export |
| `src/land/exchange-orchestration/index.ts` | 2 | Wire ProviderChain, add provenance, reportError on failure |
| `src/land/exchange-orchestration/index.test.ts` | 4 | Update mock factory, add provenance tests |
| `src/land/exchange-orchestration/orchestration-extended.test.ts` | 4 | Update mock factory, add provenance + error tests |
| `src/tree/exchange/provider/paper-provider-adapter.test.ts` | 4 | NEW: adapter tests |

No two phases touch the same file in conflict. Phase 0 modifies provider interfaces. Phase 1 adds adapter. Phase 2 modifies orchestrator. Phase 4 modifies/adds tests.

## Rollback

Each phase is independently revertible:
- Phase 0: Revert interface return types. No callers yet.
- Phase 1: Remove adapter class + getter. No callers yet.
- Phase 2: Revert orchestrator to direct provider calls. Providers map untouched.
- Phase 4: Test additions only.

## Success Criteria

1. `TickerProvider`/`OrderProvider` return raw types; `ProviderChain.execute` produces correctly-typed `ProviderResult<T>` (no double-wrap)
2. `PaperExchangeProvider` has `getCircuitBreaker()` getter; `PaperProviderAdapter` satisfies `TickerProvider & OrderProvider`
3. `ExchangeOrchestrator.fetchTicker` and `placeOrder` route through `ProviderChain`
4. `reportError` called when `chainResult.ok === false` (C3)
5. `getLastProvenance(exchangeId)` returns `ProviderResult<Ticker | OrderResult>` metadata after calls
6. Test mock factories updated with adapter-required properties (C2)
7. All 1880+ existing tests pass
8. 0 lint warnings, 0 TS errors, `npm run build` clean
9. Cross-provider consistency tests in `provider.test.ts` still pass

## Open Questions

None — the approach is clear from the interface analysis.
