# OmniRoute Patterns — Implementation Plan for trade-bot v1 (Paper-mode-only)

**Derived from:** `plans/reports/omniRoute-essence-report.md`
**Work context:** `/Users/macbook/trade-bot`
**Scope:** Paper-mode-only (Live mode and real-CCXT deferred to v2)
**Locale:** EN + VI

---

## Overview

Apply five OmniRoute patterns to CashClaw v1 (Paper-mode) to replace ad-hoc exchange wiring with a layered, observable, composable architecture. Every change stays within `src/tree/exchange/`, `src/tree/bot/`, `src/land/`, and `src/forest/`. No runtime dependency on CCXT or live exchange keys for v1.

**What is being adopted:**

| OmniRoute concept | trade-bot target | v1 scope |
|---|---|---|
| Provider abstraction | `ExchangeOrchestrator` internal wiring | Paper provider only |
| Combo / chaining | `BotInstance.strategy` | Grid + MeanReversion in chain (declarative interface, 2 strategies composable) |
| Circuit breaker | `Killswitch` | Per-provider breaker (open after consecutive failures) |
| Exponential backoff | none | Inside `RateLimiter` or decorator |
| Fair-share quota | `RateLimiter` token buckets | Add `budget` weights per ticker/symbol |
| Agent metadata | none | `src/app/api/.well-known/agent.json/route.ts` |

**What is deferred to v2 (explicit):**

- Live exchange adapter via CCXT on Cloudflare Workers
- CREATE_BOT live-mode route guard
- D1 live-trade audit table migration
- NOWPayments / PAYOS live-tier activation edge in exchange path
- agent.json /uid credential scoping

---

## Phase 1 — Provider Interface + Paper Provider

### Goal

Introduce `ExchangeProvider` abstraction so that the orchestrator calls a common surface (same interface for Paper now, Live added in v2). Provider owns health score, rate-limit tokens, and backoff cooldown.

### Files to create

1. `src/tree/exchange/provider/types.ts` (new)
   - ProviderState enum: healthy | degraded | circuit_open | cooldown
   - ProviderHealth record: score (0-100), lastSuccess, failureCount, latencyMs
   - ProviderBudget record: reqPerMin, reqPerHour, windowMs
   - ExchangeProvider interface: getAdapter(), getHealth(), getBudget(), getConfig()
   - ExchangeProviderConfig union: PaperProviderConfig | LiveProviderConfig (v2)

2. `src/tree/exchange/provider/paper-provider.ts` (new)
   - PaperExchangeProvider wraps PaperExchange
   - Tracks PaperTrade results to update health (simulate latency from order->fill duration)
   - Exposes budget from PaperConfig.tradingLimits
   - On error: decrements health, applies exponentialBackoff cooldown (1s, 2s, 4s... cap 60s)

3. `src/tree/exchange/provider/index.ts` (new)
   - Barrel exports: { ExchangeProvider, PaperExchangeProvider, types }

### Files to modify

- `src/tree/exchange/index.ts`: add provider/ barrel export
- `src/tree/exchange/types.ts`: optional — `PaperConfig` already exists; verify it has `tradingLimits` shape. If not, extend PaperConfig with `tradingLimits?: { reqPerMin: number; reqPerHour: number }`

### Implementation steps

1. Create `src/tree/exchange/provider/` directory
2. Define `types.ts` with interfaces above (zero runtime deps)
3. Implement `paper-provider.ts` with PaperExchange ownership and health tracking
4. Add `citation needed` for test hook: health can be injected for unit test
5. Update `src/tree/exchange/index.ts` with new barrel

### Test files

- `src/tree/exchange/provider/paper-provider.test.ts` (new)

### Acceptance criteria

- [ ] `ExchangeProvider` compiles with zero TS errors
- [ ] `PaperExchangeProvider` wraps PaperExchange without changing PaperExchange class
- [ ] Provider exposes `getHealth()`, `getBudget()`, `getConfig()`
- [ ] Unit test: provider reports healthy after 0 errors, degraded after 3 consecutive errors
- [ ] Unit test: provider backoff increases wait time on repeated failures (use fake timers)

### Deferred to v2

- LiveProviderConfig wiring
- CCXT provider wrapping

---

## Phase 2 — Circuit-Breaker Decorator for Exchange Adapter

### Goal

Add a circuit-breaker layer that wraps any `ExchangeAdapter` (not just Paper), opening after N consecutive failures and rejecting requests until cooldown elapses. Separate from global Killswitch — this is per-provider.

### Files to create

1. `src/tree/exchange/provider/circuit-breaker.ts` (new)
   - CircuitBreaker(options: { threshold: number; cooldownMs: number; halfOpenAfterMs: number })
   - state: closed | open | half_open
   - wrap<T>(fn: () => Promise<T>): Promise<T>
   - On failure in closed: increment failureCount; at threshold, transition to open; set cooldown deadline
   - On success in closed: reset failureCount
   - In open: reject immediately with CircuitOpenError until cooldown elapses, then half-open
   - In half-open: allow one trial request; success -> closed, failure -> back to open

### Files to modify

- `src/tree/exchange/provider/paper-provider.ts`: wrap all adapter calls in breaker
- `src/tree/exchange/provider/index.ts`: export CircuitBreaker

### Implementation steps

1. Define CircuitBreaker class with triple-state FSM
2. Wire into PaperExchangeProvider so every adapter call goes through breaker
3. Add method `provider.isCircuitOpen()` for orchestrator visibility

### Test files

- `src/tree/exchange/provider/circuit-breaker.test.ts` (new)

### Acceptance criteria

- [ ] CircuitBreaker compiles and is exported from provider module
- [ ] PaperExchangeProvider: successful calls keep breaker closed
- [ ] PaperExchangeProvider: 3 consecutive failures trip breaker open
- [ ] While open: subsequent calls throw CircuitOpenError (not swallowed)
- [ ] After cooldownMs elapses: breaker enters half-open; one trial call succeeds -> closed
- [ ] Unit tests: closed->open, open->half-open->closed, and open->half-open->open transitions

### Deferred to v2

- Alerting / metrics dashboard for breaker events

---

## Phase 3 — Exponential Backoff for RateLimiter

### Goal

Enhance `src/tree/exchange/rate-limiter/index.ts` to support exponential backoff per bucket, so single key exhaustion does not hammer the same endpoint and trigger cascading failures.

### Files to modify

- `src/tree/exchange/rate-limiter/index.ts` (patch)

### Migration path (AMEND fix)

The existing `acquire()` API remains unchanged. Two new methods are added:
- `tryAcquire(exchange, category): { allowed: boolean; waitMs?: number }` — synchronous check; returns `allowed: false` with `waitMs` when bucket empty (backoff-aware). Caller decides whether to wait.
- `recordBackoff(exchange, category, multiplier?: number)` — caller invokes after a failed request; escalates the backoff delay for that bucket. `multiplier` defaults to `2`.

The existing `acquire()` (with its internal `setTimeout` sleep) is left intact for backward compat. New code uses `tryAcquire()` + `recordBackoff()`. This is a non-breaking addition.

### Implementation steps

1. Add `backoffState: Map<string, { delayMs: number; expiresAt: number }>` to RateLimiter class
2. Add `tryAcquire(exchange, category): { allowed: boolean; waitMs?: number }` — reads bucket, if empty returns `{ allowed: false, waitMs: calculated }` considering current backoff; if available returns `{ allowed: true }` and decrements token
3. Add `recordBackoff(exchange, category, multiplier?: number)` — sets/escalates backoff in `backoffState`; initial backoff = `refillMs`, multiplied on each call, capped at 60s
4. Add `getBackoff(exchange, category): number | undefined` — returns remaining backoff ms for a bucket (0 if no backoff active)
5. Leave existing `acquire()` unchanged — backward compat for BotScheduler and other callers

### Test files

- `src/tree/exchange/rate-limiter/index.test.ts` (existing — extend with backoff tests)

### Acceptance criteria

- [ ] Modified rate-limiter compiles and existing tests pass
- [ ] `acquire()` behavior unchanged (backward compat)
- [ ] `tryAcquire()` returns `{ allowed: false, waitMs }` when bucket exhausted
- [ ] `recordBackoff()` escalates delay: 1x → 2x → 4x → ... → 60s cap
- [ ] `getBackoff()` returns remaining backoff ms
- [ ] Unit test: tryAcquire on exhaustion returns waitMs
- [ ] Unit test: recordBackoff escalates (1x, 2x, 4x) up to 60s cap
- [ ] Unit test: getBackoff resets after backoff expires

### Deferred to v2

- Per-provider backoff budgets (fair-share tiering in exchange calls)

---

## Phase 4 — StrategyChain Composable Interface

### Goal

Replace `BotInstance.strategy` (single Grid or MeanReversion with no composition) with a declarative `StrategyChain` interface where strategies declare `precondition()` and the orchestrator slides to fallback chain on stop-loss or runtime Throw.

### Files to create

1. `src/tree/bot/strategy-chain/types.ts` (new)
   - StrategyContext: symbol, balance, openPositions, lastPrice
   - ChainStrategy interface: name, precondition(ctx) -> boolean, evaluate(ctx) -> TradeSignal | null
   - ChainLeg: { strategy: ChainStrategy; on: string } (human-readable condition, for config only)
   - StrategyChain: Array<{ strategy: ChainStrategy; fallback: ChainStrategy | null }>

2. `src/tree/bot/strategy-chain/index.ts` (new)
   - `evaluateChain(chain, ctx): TradeSignal | null`
   - `strategyChainFromConfig(config: BotConfig): StrategyChain` factory (maps grid + mean_reversion configs)

3. `src/tree/bot/strategy-chain/strategies/grid.ts` (new) — extract from `src/tree/bot/strategies/grid.ts`
   - Export GridChainStrategy that implements ChainStrategy

4. `src/tree/bot/strategy-chain/strategies/mean-reversion.ts` (new)
   - Export MeanRevChainStrategy that implements ChainStrategy

5. `src/tree/bot/strategy-chain/leg-builder.ts` (new)
   - `buildDefaultChain(config: BotConfig): StrategyChain` — grid first, mean-reversion fallback (configurable via BotConfig)

### Integration with existing BotConfig discriminated union (AMEND fix)

The existing `BotConfig` is a discriminated union: `GridBotConfig | MeanRevBotConfig` keyed on `strategy: 'grid' | 'mean_reversion'`.

StrategyChain integrates via an **optional field** — no breaking change:

```typescript
// Addition to types.ts (non-breaking)
export interface ChainLeg {
  strategy: StrategyType;     // 'grid' | 'mean_reversion'
  on: string;                 // human-readable fallback condition, e.g. "stop_loss"
}

// BotConfig union extension — add optional field to BOTH variants:
export interface GridBotConfig {
  strategy: 'grid';
  // ... existing fields
  strategyChain?: ChainLeg[]; // NEW — optional, single-strategy if absent
}

export interface MeanRevBotConfig {
  strategy: 'mean_reversion';
  // ... existing fields
  strategyChain?: ChainLeg[]; // NEW — optional, single-strategy if absent
}
```

Type guard: `hasStrategyChain(config: BotConfig): config is BotConfig & { strategyChain: ChainLeg[] }` — checks `config.strategyChain?.length > 0`.

BotInstance evaluates: if `hasStrategyChain(config)` → `evaluateChain(chain, ctx)` → else legacy `config.strategy` path. Zero breaking changes.

### Files to modify

- `src/tree/bot/types.ts`:
  - Add `ChainLeg` interface, `StrategyChain` type, `TradeSignal = { side: 'buy'|'sell'; qty: number; price: number; reason: string }`
  - Extend `GridBotConfig` and `MeanRevBotConfig` with optional `strategyChain?: ChainLeg[]`
  - Add `hasStrategyChain()` type guard
- `src/tree/bot/bot-instance.ts`:
  - Add `evaluateStrategy()` branch: if `hasStrategyChain(config)` → `evaluateChain(chain, ctx)`, else legacy path
  - Keep Grid/MeanRev legacy classes intact for backward compat during transition

### Implementation steps

1. Create `strategy-chain/` directory and `types.ts`
2. Implement chain evaluator with precondition gating
3. Extract Grid/MeanRev into ChainStrategy implementations (thin wrappers around existing logic)
4. Wire into BotInstance with opt-in via BotConfig
5. Keep legacy `src/tree/bot/strategies/` unchanged (deprecation warning in comment only)

### Test files

- `src/tree/bot/strategy-chain/evaluate-chain.test.ts` (new)
- `src/tree/bot/strategy-chain/leg-builder.test.ts` (new)

### Acceptance criteria

- [ ] `strategy-chain/` compiles without errors
- [ ] `evaluateChain` returns first matching strategy signal
- [ ] Unit test: chain with precondition false skips strategy, evaluates fallback
- [ ] Unit test: chain with all preconditions false returns null (hold)
- [ ] Existing `src/tree/bot/strategies/grid.trailing.test.ts` still passes
- [ ] BotInstance can be created with legacy single strategy without new config
- [ ] (Optional) End-to-end test: config with grid then mean-reversion chain fills one trade via chain

### Deferred to v2

- DCA strategy leg
- Persistence of chain-leg config in D1
- Hot-reload of active strategy chain without bot restart

---

## Phase 5 — Fair-Share Quota Budgets

### Goal

Augment `RateLimiter` token buckets with logical `budget` weights so scheduler picks healthiest adapter under budget, not round-robin.

### Files to modify

- `src/tree/exchange/rate-limiter/index.ts`: add `budgetMap: Map<string, number>` representing remaining quota for exchange+category combination

### Implementation steps

1. Add `setBudget(exchange, category, reqPerMin, reqPerHour)` to RateLimiter
2. In acquire(), after refill, return false AND indicate remaining budget count via optional third return value; caller can use remaining to pick "fattest pipe"
3. Land layer (`src/land/exchange-orchestration/index.ts`) calls acquire() before each adapter call and selects the adapter with most remaining budget among healthy ones

### Test files

- `src/tree/exchange/rate-limiter/index.test.ts` (extend existing — add budget tests)

### Acceptance criteria

- [ ] RateLimiter exposes setBudget + getRemainingBudget(exchange, category)
- [ ] Land orchestrator uses budget-aware adapter selection when multiple adapters exist (presently only Paper, but interface ready for Live v2)
- [ ] Unit test: budget decrements correctly, reset at window boundary
- [ ] Unit test: acquire rejects when budget hits zero even if tokens remain (or vice versa — specification here: budget wins)

### Deferred to v2

- Multi-provider budget arbitration (multiple keys per exchange)

---

## Phase 6 — Agent Metadata Endpoint

### Goal

Expose `/.well-known/agent.json` so external dashboards can discover running strategies and health without coupling to internal APIs.

### Files to create

1. `src/app/api/.well-known/agent.json/route.ts` (static file)
2. `src/app/api/.well-known/agent.json/route.ts` patch to mount `GET /.well-known/agent.json` serving the static file with cache-control

### Implementation steps

1. Create `src/app/api/.well-known/agent.json/route.ts` with CashClaw bot metadata: name, version, strategies supported, health endpoint, security (no credentials exposed)
2. Mount GET route with no auth (public discovery), cache 5 minutes
3. Validate JSON against https://well-known.club/schema (light manual check)

### Acceptance criteria

- [ ] `curl https://<host>/.well-known/agent.json` returns 200 with valid JSON
- [ ] No secrets exposed in metadata
- [ ] Cache-Control header present with max-age 300

### Deferred to v2

- /uid scoping and per-bot identity
- Live health aggregation from multiple providers

---

## Phase 7 — Orchestrator Wiring (Land)

### Goal

Update `ExchangeOrchestrator` to use Provider layer and CircuitBreaker, exposing its health and budget to the Land orchestrator APIs.

### Files to modify

1. `src/land/exchange-orchestration/index.ts`
2. `src/forest/bot/scheduler.ts` — **required** (AMEND fix): tick() checks `provider.isCircuitOpen(exchangeId)` before calling bot.tick(); if circuit open, skip bot with logged warning, don't count as error
3. `src/tree/exchange/rate-limiter/index.ts` (budget hooks from Phase 5)

### Implementation steps

1. Add private `providers: Map<string, ExchangeProvider>` to ExchangeOrchestrator
2. Add `registerProvider(exchangeId: string, provider: ExchangeProvider)` and `getProvider(exchangeId)`
3. Replace direct `new PaperExchange()` with `new PaperExchangeProvider()`
4. Wrap adapter calls in provider (provider already wraps in CircuitBreaker in Phase 2)
5. Add `selectHealthyProvider(exchangeId): ExchangeProvider | undefined` for orchestrator to pick best adapter under budget constraints

### Acceptance criteria

- [x] ExchangeOrchestrator tests pass with new Provider-based flow
- [x] No direct `new PaperExchange()` calls outside provider/ directory
- [x] Orchestrator reports provider health via `reportError()` → `onError` callback (not `console.*`)
- [x] Scheduler uses `isCircuitOpen()` via `getOrchestrator().getOrCreateProvider(exchange).isCircuitOpen()` to skip tick when provider in open state; skip reported via `deps.onEvalError`, not counted in `errors[]`

---

## Integration and Final Acceptance Criteria

1. **Paper-mode end-to-end**: BotManager -> BotInstance -> ExchangeOrchestrator -> PaperExchangeProvider -> PaperExchange -> trade. All steps upholsitic, type-safe.
2. **Resilience**: RateLimiter backoff + CircuitBreaker open state verified under 100% loss simulation
3. **Strategy chain**: Bot with grid + mean-reversion chain config fills at least 1 trade via chain in backtest
4. **Agent metadata**: src/app/api/.well-known/agent.json/route.ts returned with HTTP 200
5. **Zero regression**: existing `npm test` passes (844+ tests)
6. **Zero :any types** in new files
7. **Zero console.log** in new files

---

## Files Modified Summary (v1 Paper-mode)

| Path | Action | Phase |
|---|---|---|
| src/tree/exchange/provider/types.ts | CREATE | 1 |
| src/tree/exchange/provider/paper-provider.ts | CREATE | 1 |
| src/tree/exchange/provider/index.ts | CREATE | 1 |
| src/tree/exchange/provider/circuit-breaker.ts | CREATE | 2 |
| src/tree/exchange/rate-limiter/index.ts | PATCH | 3, 5 |
| src/tree/exchange/index.ts | PATCH (barrel) | 1 |
| src/tree/exchange/types.ts | PATCH (optional) | 1 |
| src/tree/bot/strategy-chain/types.ts | CREATE | 4 |
| src/tree/bot/strategy-chain/index.ts | CREATE | 4 |
| src/tree/bot/strategy-chain/strategies/grid.ts | CREATE | 4 |
| src/tree/bot/strategy-chain/strategies/mean-reversion.ts | CREATE | 4 |
| src/tree/bot/strategy-chain/leg-builder.ts | CREATE | 4 |
| src/tree/bot/types.ts | PATCH | 4 |
| src/tree/bot/bot-instance.ts | PATCH | 4 |
| src/land/exchange-orchestration/index.ts | PATCH | 7 |
| src/app/api/.well-known/agent.json/route.ts | PATCH | 6 |
| src/app/api/.well-known/agent.json/route.ts | CREATE | 6 |

---

## Verification Steps

1. Run `npm run build` — zero errors
2. Run `npm test` — all pass, coverage unchanged or improved
3. Run `npm run type-check` — zero errors
4. Deploy to preview, smoke test:
   - Create Paper bot (no live toggle visible)
   - Bot completes one simulated trade
   - Trigger sustained failures: rate-limiter backoff escalates, circuit breaker opens, orchestrator pauses tick
   - Visit /.well-known/agent.json — 200 with JSON body

---

## Out of Scope for v1 (explicit)

- CCXT bundling verification on Cloudflare Workers
- Live exchange credentials in D1
- Multi-provider rate-limit arbitration with shared key pools
- DCA strategy leg implementation
- Hot-reload strategy chain config
- NOWPayments / PAYOS live-tier gating in exchange
- Telegram bot `/agent.json` discovery extensions
