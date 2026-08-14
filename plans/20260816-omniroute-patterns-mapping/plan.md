# OmniRoute Patterns Mapping — Implementation Plan

**Date:** 2026-08-16
**Source:** OmniRoute v3.8.50 (47k stars) patterns
**Target:** CashClaw AI Trading Bot (Next.js 16 + CF Workers + D1)
**Mode:** Auto-parallel execution

---

## Executive Summary

Mapped 10 OmniRoute engineering patterns to 8 concrete implementation tasks across 3 priority tiers. Tasks are organized for parallel execution with clear file ownership boundaries.

**Quick wins (P0):** 2 tasks, ~3h total — fix critical bugs + add Zod validation
**Core improvements (P1):** 4 tasks, ~8h total — circuit breaker upgrade, error normalization, env validation, rate limiter
**Quality gates (P2):** 2 tasks, ~4h total — quality gate scripts, test coverage raise

---

## Pattern → Task Mapping

### P0 — CRITICAL (Must fix before production)

#### Task 1: Fix `log` Reference Bug + Add Missing Import
- **OmniRoute pattern:** Zero broken imports in production (CI gate `check:imports`)
- **Current bug:** `bot-manager.ts:197` uses `log` without importing `createLogger`
- **Files:** `src/tree/bot/bot-manager.ts`
- **Fix:** Add `import { createLogger } from '@/lib/logger';` + `const log = createLogger('bot-manager');`
- **Time:** 10 min
- **Verify:** `npm test` passes, no `ReferenceError` in logs

#### Task 2: Add Zod Validation to API Handlers
- **OmniRoute pattern:** Zod-validated env schema at startup (`runtimeEnv.ts`), all inputs validated
- **Current gap:** `botCreateHandler` trusts `req.json()` with type assertion, no runtime validation
- **Files:** `src/forest/api/handlers/bot-create.ts`, new `src/lib/validation.ts`
- **Implementation:**
  - Create shared Zod schemas in `src/lib/validation.ts`
  - Define `CreateBotSchema`, `BotControlSchema`
  - Validate in handlers before processing
- **Time:** 2h
- **Verify:** Invalid payloads return 400 with structured error

---

### P1 — CORE IMPROVEMENTS (High value)

#### Task 3: Upgrade Circuit Breaker to 4-State with Adaptive Backoff
- **OmniRoute pattern:** 4-state circuit breaker (CLOSED→DEGRADED→OPEN→HALF_OPEN) with per-failure-kind thresholds, exponential cooldown (30s→480s), DB persistence
- **Current:** Killswitch has basic on/off + consecutive loss tracking, no exchange-level circuit breaker
- **Files:** `src/tree/exchange/circuit-breaker.ts` (new), `src/tree/exchange/types.ts` (extend)
- **Implementation:**
  - New `CircuitBreaker` class with states: `closed | degraded | open | half_open`
  - Per-exchange instance (not global)
  - Adaptive backoff: 30s base, 2x escalation per cycle, cap at 480s
  - `recordFailure(kind)` / `recordSuccess()` API
  - `canExecute()` check before orders
- **Time:** 3h
- **Verify:** Unit tests for state transitions, cooldown escalation, half-open recovery

#### Task 4: Exchange Error Normalization Pipeline
- **OmniRoute pattern:** 3-layer error normalization: `upstreamError` (shape) → `fetchError` (message) → `classify429` (kind)
- **Current:** Raw catch blocks with `instanceof Error` checks, no classification
- **Files:** `src/tree/exchange/error-normalizer.ts` (new), update exchange adapters
- **Implementation:**
  - `ExchangeError` type with `kind: 'rate_limit' | 'exchange_down' | 'invalid_order' | 'insufficient_balance' | 'transient'`
  - `normalizeExchangeError(raw: unknown): ExchangeError` function
  - Feed into circuit breaker `recordFailure(error.kind)`
  - Return `Result<T>` from all exchange operations
- **Time:** 2h
- **Verify:** Error classification tests for Binance/OKX error shapes

#### Task 5: Zod-Validated Environment Config
- **OmniRoute pattern:** `runtimeEnv.ts` validates all env at startup with `enforceWebRuntimeEnv()`, fail-fast with clear errors
- **Current:** Scattered `process.env` access, no validation
- **Files:** `src/lib/env-config.ts` (new), `src/worker.ts` (call at startup)
- **Implementation:**
  - Zod schema for required env vars: `EXCHANGE_API_KEY`, `EXCHANGE_API_SECRET`, `SESSION_SECRET`, etc.
  - `getEnvConfig()` with type-safe return
  - `enforceEnv()` called at Worker startup — throws clear error if missing
  - Replace all `process.env.X` access with `getEnvConfig().X`
- **Time:** 2h
- **Verify:** Worker fails fast with clear message on missing env

#### Task 6: Dual-Backend Rate Limiter
- **OmniRoute pattern:** Fixed-window rate limiter with Redis/in-memory dual backend, fail-open on Redis failure
- **Current:** Module-level `setInterval` + `Map` in `rate-limiter.ts` (per-isolate leak risk)
- **Files:** `src/forest/api/rate-limiter.ts` (rewrite)
- **Implementation:**
  - Fixed-window counter (not sliding)
  - Primary: CF KV-backed (for cross-isolate state)
  - Fallback: in-memory Map (isolated per request)
  - Fail-open on storage failure (never block legitimate trades)
  - Clean up expired entries on window boundary
- **Time:** 1.5h
- **Verify:** Rate limit blocks after threshold, opens on storage failure

---

### P2 — QUALITY GATES (Long-term health)

#### Task 7: Add Quality Gate Scripts
- **OmniRoute pattern:** 60+ quality scripts: `check:complexity`, `check:cycles`, `check:dead-code`, `check:secrets`, `quality:gate`
- **Current:** Only `npm run lint` and `npm test`
- **Files:** `package.json` (add scripts), new `scripts/quality-gate.sh`
- **Implementation:**
  - `check:complexity` — ESLint complexity rule
  - `check:cycles` — dependency-cruiser or madge
  - `check:dead-code` — knip
  - `check:secrets` — gitleaks or custom grep
  - `quality:gate` — runs all checks, exits non-zero on failure
- **Time:** 2h
- **Verify:** `npm run quality:gate` passes

#### Task 8: Raise Coverage Thresholds
- **OmniRoute pattern:** 60% minimum on all coverage metrics, mutation testing with Stryker
- **Current:** Asymmetric thresholds: statements 55%, branches 85%, functions 85%, lines 55%
- **Files:** `vitest.config.ts`
- **Implementation:**
  - Raise statements/lines from 55% → 65%
  - Keep branches/functions at 85%
  - Add test for FlightRecorder class (currently uncovered)
  - Add integration test for D1 hydration cycle
- **Time:** 2h
- **Verify:** `npm test` passes with new thresholds

---

## Parallel Execution Plan

```
Phase 1 (P0 — immediate):
├── Task 1: Fix log bug ──────────────── [10 min]
└── Task 2: Zod validation ───────────── [2h]

Phase 2 (P1 — core, after P0):
├── Task 3: Circuit breaker ──────────── [3h] ─┐
├── Task 4: Error normalizer ─────────── [2h]  ├── PARALLEL
├── Task 5: Env config ──────────────── [2h]  │
└── Task 6: Rate limiter ────────────── [1.5h] ┘

Phase 3 (P2 — quality, after P1):
├── Task 7: Quality gates ────────────── [2h] ─┐
└── Task 8: Coverage thresholds ──────── [2h]  └── PARALLEL
```

**Total estimated time:** ~15h (parallelized to ~7h wall-clock)

---

## File Ownership (No Conflicts)

| Task | Primary Files | Layer |
|------|--------------|-------|
| 1 | `bot-manager.ts` | tree |
| 2 | `validation.ts` (new), `bot-create.ts` | lib, forest |
| 3 | `circuit-breaker.ts` (new), `types.ts` | tree |
| 4 | `error-normalizer.ts` (new) | tree |
| 5 | `env-config.ts` (new), `worker.ts` | lib, root |
| 6 | `rate-limiter.ts` | forest |
| 7 | `package.json`, `scripts/` | root |
| 8 | `vitest.config.ts`, test files | root |

No two tasks modify the same file — safe for parallel execution.

---

## Success Criteria

- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` passes with 0 TypeScript errors
- [ ] Circuit breaker handles exchange failure cascades
- [ ] API inputs validated with Zod (400 on invalid)
- [ ] Env vars validated at startup (fail-fast)
- [ ] Rate limiter doesn't leak across CF Worker isolates
- [ ] Coverage thresholds raised and passing
- [ ] Quality gate script runs clean
