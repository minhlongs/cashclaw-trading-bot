# OmniRoute → Trade-Bot (CashClaw) Adaptation Report

**Source:** https://github.com/diegosouzapw/OmniRoute (v3.8.50, 47k stars, 6,773 commits)
**Target:** `/Users/macbook/trade-bot` (Next.js 15 + Cloudflare Workers + D1)
**Date:** 2026-08-16
**Purpose:** Actionable TL;DR for fullstack-developer go-live implementation

---

## TL;DR

Apply 7 high-impact OmniRoute patterns to close trade-bot go-live gaps. Priority order: (1) Rate limiter harden + header learning + wedge watchdog, (2) CircuitBreaker 4-state + kind-aware thresholds + persistence, (3) D1 canonical JSON serializer for hash-chain integrity, (4) Exchange hot-path: `QueuedExchangeAdapter` bypass for market data, (5) CostTracker daily budget enforcement on queue drain, (6) Killswitch audit trail via hash-chained `audit_ledger`, (7) Error normalization with structured codes + sanitization. Each maps to specific trade-bot files below.

---

## 1. Reframed Problem

**Real decision:** Trade-bot has 8 critical gaps identified by scout (no caching, no canonical JSON, QuantLib stub, no exchange barrel, ProviderChain paper-only, in-memory rate limiter, no graceful shutdown, unverified coverage). OmniRoute — a production AI gateway with 25k+ tests, 25 CI workflows, and 47k stars — solved equivalent problems at scale. Map its patterns directly to trade-bot files without rewriting architecture.

**Requirements:**
- Cloudflare Workers (edge) + Next.js App Router + D1 (SQLite-compatible)
- Paper trading v1; live trading deferred
- Binance/Bybit/OKX via `src/tree/exchange/` adapters
- `forest/tree/land` layer boundaries must stay
- Go-live = safety-critical (killswitch, audit trail, rate limits) + observability

---

## 2. Seven High-Impact Adaptations (P0/P1)

### Pattern 1: Rate Limiter Harden + Header Learning + Wedge Watchdog (P0)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Bottleneck + custom patches (`bottleneckPatch.ts`) | `src/tree/exchange/rate-limiter/index.ts` has token bucket but no header learning, no wedge detection | Add header parsing, wedge watchdog, typed error codes |

**OmniRoute source:** `open-sse/services/rateLimitManager.ts`, `admission.ts`, `headers.ts`, `errors.ts`, `wedgeWatchdog.ts`

**Trade-Bot files to modify:**
```
src/tree/exchange/rate-limiter/index.ts         // Main rate limiter — add header learning + wedge watchdog
src/tree/exchange/rate-limiter/headers.ts       // NEW: parse x-ratelimit-*, retry-after, anthropic-ratelimit-*
src/tree/exchange/rate-limiter/wedge-watchdog.ts // NEW: detect stuck limiters, auto-recover
src/tree/exchange/rate-limiter/errors.ts        // NEW: RATE_LIMIT_EXECUTION_TIMEOUT, RATE_LIMIT_QUEUE_FULL, RATE_LIMIT_QUEUE_WEDGED (WeakMap branded)
src/tree/exchange/provider/types.ts             // Extend ProviderBudget with learned limits
```

**Implementation:**
```typescript
// src/tree/exchange/rate-limiter/headers.ts (NEW)
export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot {
  return {
    limit: parseInt(headers.get('x-ratelimit-limit') ?? '0'),
    remaining: parseInt(headers.get('x-ratelimit-remaining') ?? '0'),
    resetAt: parseInt(headers.get('x-ratelimit-reset') ?? '0') * 1000,
    retryAfter: headers.get('retry-after') ? parseInt(headers.get('retry-after')!) * 1000 : null,
    anthropicLimit: headers.get('anthropic-ratelimit-requests-limit'),
    anthropicRemaining: headers.get('anthropic-ratelimit-requests-remaining'),
  };
}

// src/tree/exchange/rate-limiter/wedge-watchdog.ts (NEW)
export function startWedgeWatchdog(
  limiters: Map<string, Bottleneck>,
  intervalMs: number = 30_000
): () => void {
  return setInterval(() => {
    for (const [key, limiter] of limiters) {
      const running = limiter.running();
      const queued = limiter.queued();
      const idleCapacity = limiter.capacity() - running;
      if (running === 0 && queued > 0 && idleCapacity > 0) {
        // Wedge detected: idle capacity but queued work
        limiter.disconnect(); // forces recreation on next use
        console.warn(`[wedge-watchdog] Reset wedged limiter: ${key}`);
      }
    }
  }, intervalMs);
}
```

**Success metric:** Zero stuck limiters in 24h load test; 429 responses reduced >90% via header learning.

---

### Pattern 2: CircuitBreaker 4-State + Kind-Aware Thresholds + Persistence (P0)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| `CLOSED → DEGRADED (60%) → OPEN → HALF_OPEN → CLOSED` with per-failure-kind thresholds | `src/tree/exchange/provider/circuit-breaker.ts` is 3-state, no DEGRADED, no kind awareness, no persistence | Upgrade to 4-state, add failure kinds, persist to D1 |

**OmniRoute source:** `src/shared/utils/circuitBreaker.ts`, `open-sse/services/tokenRefresh/circuitBreaker.ts`

**Trade-Bot files to modify:**
```
src/tree/exchange/provider/circuit-breaker.ts     // Upgrade: add DEGRADED state, kind thresholds, D1 persistence
src/tree/exchange/provider/circuit-breaker-kinds.ts // NEW: FailureKind enum + per-kind config
src/tree/exchange/provider/circuit-persistence.ts  // NEW: save/load state to D1 audit_ledger
src/tree/exchange/provider/paper-provider.ts      // Wire new breaker config per exchange
src/tree/exchange/provider/provider.ts            // ProviderChain uses kind-aware breaker
```

**Implementation:**
```typescript
// src/tree/exchange/provider/circuit-breaker-kinds.ts (NEW)
export type FailureKind = 'timeout' | 'rate_limit' | 'server_error' | 'network' | 'unknown';

export const FAILURE_KIND_THRESHOLDS: Record<FailureKind, { threshold: number; cooldownMs: number }> = {
  timeout:       { threshold: 3,  cooldownMs: 15_000 },
  rate_limit:    { threshold: 5,  cooldownMs: 30_000 },
  server_error:  { threshold: 5,  cooldownMs: 30_000 },
  network:       { threshold: 10, cooldownMs: 10_000 },
  unknown:       { threshold: 5,  cooldownMs: 30_000 },
};

export function classifyFailure(err: unknown): FailureKind {
  // Reuse error-normalizer.ts classification
  const normalized = normalizeExchangeError(err);
  return normalized.kind === 'rate_limit' ? 'rate_limit'
       : normalized.kind === 'exchange_down' ? 'server_error'
       : normalized.kind === 'transient' ? 'network'
       : 'unknown';
}

// src/tree/exchange/provider/circuit-breaker.ts (UPGRADE)
export type CircuitState = 'closed' | 'degraded' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  // Per-kind overrides; defaults from FAILURE_KIND_THRESHOLDS
  kindThresholds?: Partial<Record<FailureKind, { threshold: number; cooldownMs: number }>>;
  persistenceKey?: string; // D1 key for cross-restart state
  onStateChange?: (from: CircuitState, to: CircuitState, timestamp: number, kind?: FailureKind) => void;
}

// In execute(): track failure kind, apply kind-specific threshold
// Add DEGRADED at 60% of threshold (warning without blocking)
// Add persistence: save state on every transition, load on init
```

**Success metric:** Circuit trips correctly per failure kind; survives worker restart with state intact.

---

### Pattern 3: D1 Canonical JSON Serializer (P0)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Deterministic serialization for cache keys, audit chains | `src/forest/api/handlers/serialize-detail.ts` handles BigInt/Date but not canonical key ordering | Add canonical JSON with sorted keys for hash-chain integrity |

**Trade-Bot files to modify:**
```
src/forest/api/handlers/serialize-detail.ts       // UPGRADE: add canonicalize() with sorted keys
src/forest/flight-recorder/audit-ledger.ts        // Use canonicalize() for hash chain payload
src/tree/telemetry/writer.ts                      // Use canonicalize() for telemetry detail_json
src/lib/canonical-json.ts                         // NEW: pure function, no dependencies
```

**Implementation:**
```typescript
// src/lib/canonical-json.ts (NEW)
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  // Object: sort keys for determinism
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map(k => canonicalize(k) + ':' + canonicalize((value as Record<string, unknown>)[k])).join(',') + '}';
}

// In audit-ledger.ts:
const payload = canonicalize({ action, userId, botId, detailJson, timestamp: Date.now() });
const hash = await computeHash(prevHash, payload);

// In telemetry writer:
detail_json: canonicalize(detail)
```

**Success metric:** `AuditLedger.verifyChain()` passes 100% across restarts; cache keys deterministic.

---

### Pattern 4: Exchange Hot-Path — Market Data Bypass (P1)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Local-first, zero-cloud-hops for cached data | `QueuedExchangeAdapter.fetchTicker()` already bypasses queue — verify & harden | Ensure market data path is zero-queue, add WS fallback |

**Trade-Bot files to verify/modify:**
```
src/tree/exchange/queue/queued-adapter.ts         // VERIFY: fetchTicker/fetchOrderBook bypass queue (lines 52-64)
src/tree/exchange/ws/ws-manager.ts                // Add WS ticker subscription as primary, REST as fallback
src/tree/exchange/provider/paper-provider.ts      // Ensure PaperExchangeProvider.fetchTicker() is direct
src/tree/bot/bot-tick.ts                          // Hot path: fetch price → evaluate → delegate (must stay < tick interval)
```

**Action:** Confirm `QueuedExchangeAdapter.fetchTicker()` and `fetchOrderBook()` execute directly (already done lines 52-64). Add WebSocket ticker feed as primary for Binance/Bybit/OKX with REST fallback. No code change needed for queue bypass — just validate.

**Success metric:** P99 ticker latency <50ms paper, <200ms live (including network).

---

### Pattern 5: CostTracker Daily Budget Enforcement on Queue Drain (P1)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Fair-share quota: budget per key, weighted by health | `CostTracker` exists but only consulted at `dequeue()`, not at `enqueue()` | Enforce budget at enqueue + drain; add health-weighted scheduling |

**OmniRoute source:** `domain/costRules.ts`, `admission/queue.ts` (fair multi-tenant)

**Trade-Bot files to modify:**
```
src/tree/exchange/queue/cost-tracker.ts             // Add health-weighted budget check
src/tree/exchange/queue/request-queue.ts            // Add canEnqueueBudget() + budget at enqueue
src/tree/exchange/queue/types.ts                    // Add health score to QueueItem
src/tree/exchange/provider/types.ts                 // ProviderHealth already has score — wire it
```

**Implementation:**
```typescript
// src/tree/exchange/queue/request-queue.ts (UPGRADE)
enqueue<T>(item: Omit<QueueItem<T>, 'id' | 'enqueuedAt'>): string | null {
  // ... existing capacity check
  
  // NEW: Budget check at enqueue (fail fast)
  if (this.costTracker.isOverBudget(item.exchange)) {
    return null; // Reject early, don't queue
  }
  
  // NEW: Health-weighted priority boost
  const providerHealth = this.getProviderHealth(item.exchange);
  const effectivePriority = item.priority - Math.floor(providerHealth.score / 25); // 0-100 → 0-4 boost
  
  // ... insert with effectivePriority
}

// src/tree/exchange/queue/cost-tracker.ts (UPGRADE)
getHealthWeightedBudget(exchange: ExchangeId, healthScore: number): number {
  const base = this.getRemaining(exchange);
  return Math.floor(base * (healthScore / 100)); // Scale by health
}
```

**Success metric:** Zero budget overruns; unhealthy providers naturally deprioritized.

---

### Pattern 6: Killswitch Audit Trail — Hash-Chained `audit_ledger` (P1)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Append-only hash chain per provider | `audit_ledger` table + `appendAudit()` exist but not wired to killswitch events | Wire killswitch halt/resume to `appendAudit()`; add manifest on bot start |

**OmniRoute pattern:** Hash manifest per run + hash-chained fsynced ledger

**Trade-Bot files to modify:**
```
src/tree/bot/killswitch.ts                          // Wire halt/resume to appendAudit()
src/forest/flight-recorder/audit-ledger.ts          // Already has hash chain — use it
src/forest/bot/d1-persistence.ts                    // Add manifest recording on bot start
src/app/api/killswitch-status/route.ts              // Add verifyChain endpoint
```

**Implementation:**
```typescript
// src/tree/bot/killswitch.ts (UPGRADE)
import { appendAudit } from '@/forest/flight-recorder/audit-ledger';

private halt(reason: string): void {
  if (this.state.halted) return;
  this.state.halted = true;
  this.state.haltReason = reason;
  this.state.haltTimestamp = Date.now();
  this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60_000;
  this.callbacks.onHalt(reason);
  
  // NEW: Audit trail
  appendAudit({
    action: 'killswitch_halt',
    botId: 'global',
    detailJson: JSON.stringify({ reason, dailyPnl: this.state.dailyPnl, consecutiveLosses: this.state.consecutiveLosses }),
  }).catch(() => {}); // Fire-and-forget for safety
}

private resume(): void {
  this.state.halted = false;
  this.state.haltReason = null;
  this.state.cooldownUntil = null;
  this.callbacks.onResume();
  
  appendAudit({
    action: 'killswitch_resume',
    botId: 'global',
    detailJson: JSON.stringify({ previousHaltReason: this.state.haltReason }),
  }).catch(() => {});
}

// src/forest/bot/d1-persistence.ts (ADD)
export async function recordBotManifest(botId: string, config: BotConfig): Promise<void> {
  const manifest = {
    botId,
    config: canonicalize(config),
    codeVersion: process.env.VERSION ?? 'dev',
    timestamp: Date.now(),
  };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(manifest)));
  await appendAudit({
    action: 'bot_manifest',
    botId,
    detailJson: canonicalize({ manifest, hash: Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('') }),
  });
}
```

**Success metric:** `verifyChain()` returns valid for 100% of bot lifecycles; manifest captured on every start.

---

### Pattern 7: Error Normalization + Structured Codes + Sanitization (P1)

| OmniRoute | Trade-Bot Gap | Action |
|-----------|---------------|--------|
| Multi-provider error classification, sanitized outputs, WeakMap branded codes | `error-normalizer.ts` exists but not wired to circuit breaker; no structured error codes | Wire normalizer → breaker; add error codes; sanitize all API responses |

**OmniRoute source:** `errorClassifier.ts`, `error.ts` (sanitization), `errors.ts` (branded codes)

**Trade-Bot files to modify:**
```
src/tree/exchange/error-normalizer.ts               // Already good — add error codes
src/tree/exchange/provider/circuit-breaker.ts       // Use normalized error kind for kind-aware thresholds
src/forest/api/handlers/*.ts                        // Wrap all responses with sanitized errors
src/forest/api/auth-guard.ts                        // Sanitize auth errors
src/lib/error-codes.ts                              // NEW: branded error codes (WeakMap)
```

**Implementation:**
```typescript
// src/lib/error-codes.ts (NEW)
const errorBrand = new WeakMap<Error, string>();

export function brandError(err: Error, code: string): Error {
  errorBrand.set(err, code);
  return err;
}

export function getErrorCode(err: unknown): string | null {
  return err instanceof Error ? errorBrand.get(err) ?? null : null;
}

// Error codes
export const ERROR_CODES = {
  RATE_LIMIT_EXECUTION_TIMEOUT: 'RATE_LIMIT_EXECUTION_TIMEOUT',
  RATE_LIMIT_QUEUE_FULL: 'RATE_LIMIT_QUEUE_FULL',
  RATE_LIMIT_QUEUE_WEDGED: 'RATE_LIMIT_QUEUE_WEDGED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  CIRCUIT_DEGRADED: 'CIRCUIT_DEGRADED',
  EXCHANGE_DOWN: 'EXCHANGE_DOWN',
  INVALID_ORDER: 'INVALID_ORDER',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  KILLSWITCH_HALTED: 'KILLSWITCH_HALTED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
} as const;

// In circuit-breaker.ts:
throw brandError(new CircuitOpenError(remaining), ERROR_CODES.CIRCUIT_OPEN);

// In API handlers:
catch (err) {
  const code = getErrorCode(err);
  return { ok: false, error: sanitizeMessage(err), code };
}
```

**Success metric:** All API errors have codes; no internal details leaked; circuit breaker uses error kinds correctly.

---

## 3. Work Checklist (Ordered by Dependency)

### Phase 1: Resilience Foundation (Week 1) — P0
- [ ] `src/tree/exchange/rate-limiter/headers.ts` — Parse exchange rate limit headers
- [ ] `src/tree/exchange/rate-limiter/wedge-watchdog.ts` — Detect stuck limiters
- [ ] `src/tree/exchange/rate-limiter/errors.ts` — Branded error codes
- [ ] `src/tree/exchange/provider/circuit-breaker-kinds.ts` — FailureKind + per-kind thresholds
- [ ] `src/tree/exchange/provider/circuit-breaker.ts` — Upgrade to 4-state + kind awareness + D1 persistence
- [ ] `src/tree/exchange/provider/circuit-persistence.ts` — Save/load breaker state to D1
- [ ] `src/lib/canonical-json.ts` — Canonical JSON with sorted keys
- [ ] `src/forest/api/handlers/serialize-detail.ts` — Use canonicalize()
- [ ] `src/forest/flight-recorder/audit-ledger.ts` — Use canonicalize() for hash chain

### Phase 2: Safety & Audit (Week 1-2) — P0/P1
- [ ] `src/tree/bot/killswitch.ts` — Wire halt/resume to `appendAudit()`
- [ ] `src/forest/bot/d1-persistence.ts` — Add `recordBotManifest()`
- [ ] `src/app/api/killswitch-status/route.ts` — Add `verifyChain()` endpoint
- [ ] `src/lib/error-codes.ts` — Branded error codes (WeakMap)
- [ ] Wire error-normalizer → circuit-breaker kind-aware thresholds

### Phase 3: Performance & Budget (Week 2) — P1
- [ ] `src/tree/exchange/queue/request-queue.ts` — Budget check at enqueue + health-weighted priority
- [ ] `src/tree/exchange/queue/cost-tracker.ts` — Health-weighted budget
- [ ] Verify `QueuedExchangeAdapter` market data bypass (already done)
- [ ] `src/tree/exchange/ws/ws-manager.ts` — Add WS ticker as primary path

### Phase 4: Validation (Week 2-3)
- [ ] Load test: 1000 req/min per exchange, verify <1% 429s
- [ ] Circuit breaker chaos test: inject failures, verify trip/recovery per kind
- [ ] Audit chain verify: restart workers, run `verifyChain()` on all bots
- [ ] Error sanitization audit: grep for `console.error`, `throw new Error` without codes

---

## 4. What to Avoid

| Tempting Move | Why Wrong | Do Instead |
|---------------|-----------|------------|
| Add Redis for rate limiter state | Workers are stateless; D1 + in-memory + header learning is enough | Persist breaker state to D1; learn limits from headers |
| Full QuantLib port now | Vibe-Trading quantlib is 265 functions; trade-bot v1 needs only grid/mean-reversion math | Stub `src/tree/quantlib/` with Black-Scholes + VaR only; defer full port |
| Rewrite ProviderChain for live | Live adapter has own path; ProviderChain is paper-only abstraction | Wire live adapter to use same `ProviderChain` + breaker pattern |
| Add BullMQ for job queue | CF Cron + in-memory queue + TelemetryWriter is sufficient for v1 | Keep Cron drain; add graceful shutdown handler |
| Use `JSON.stringify` for audit | Key order non-deterministic → hash chain breaks on restart | Use `canonicalize()` from `src/lib/canonical-json.ts` |

---

## 5. Alternatives & Trade-offs

| Alternative | Cost | When to Choose |
|-------------|------|----------------|
| **OmniRoute-style multi-provider routing (auto-combo)** | High — requires live adapters + health scoring | Only when ≥2 live exchanges running |
| **Full semantic cache (OmniRoute)** | Medium — needs signature generation + storage | Only if D1 read latency >100ms p99 |
| **WASM QuantLib** | High — Rust/AssemblyScript toolchain | Only if TS numeric precision fails |
| **External audit anchor (public chain)** | Medium — notarization cost | If regulatory requires it |

**Recommendation:** Stick to the 7 patterns above. They close go-live gaps with minimal code and no new infrastructure.

---

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Rate limiter 429 rate | <1% of requests | Worker analytics + `wedge-watchdog` logs |
| Circuit breaker trip accuracy | 100% per failure kind | Chaos test: inject timeout/429/5xx/network |
| Audit chain integrity | 100% `verifyChain()` pass | Daily cron + deploy-time check |
| Canonical JSON determinism | Same hash for same object across restarts | Unit test: `canonicalize(a) === canonicalize(a)` |
| Market data latency (paper) | P99 <50ms | `bot-tick.ts` instrumentation |
| Budget enforcement | Zero overruns | `CostTracker.snapshot()` in dashboard |
| Error code coverage | 100% API responses have `code` | Grep `ok: false` → all have `code` |

---

## 7. File Map Summary

```
trade-bot/
├── src/
│   ├── tree/
│   │   ├── exchange/
│   │   │   ├── rate-limiter/
│   │   │   │   ├── index.ts              ← P0: add header learning, wedge watchdog
│   │   │   │   ├── headers.ts            ← NEW P0
│   │   │   │   ├── wedge-watchdog.ts     ← NEW P0
│   │   │   │   └── errors.ts             ← NEW P0
│   │   │   ├── provider/
│   │   │   │   ├── circuit-breaker.ts    ← P0: 4-state + kind-aware + persistence
│   │   │   │   ├── circuit-breaker-kinds.ts ← NEW P0
│   │   │   │   ├── circuit-persistence.ts ← NEW P0
│   │   │   │   ├── paper-provider.ts     ← Wire new breaker
│   │   │   │   ├── provider.ts           ← ProviderChain uses kind-aware
│   │   │   │   └── types.ts              ← Extend ProviderHealth
│   │   │   ├── queue/
│   │   │   │   ├── request-queue.ts      ← P1: budget at enqueue + health weight
│   │   │   │   ├── cost-tracker.ts       ← P1: health-weighted budget
│   │   │   │   └── types.ts              ← Add health score
│   │   │   ├── error-normalizer.ts       ← Wire to breaker
│   │   │   └── ws/ws-manager.ts          ← WS ticker primary path
│   │   ├── bot/
│   │   │   ├── killswitch.ts             ← P0: wire to appendAudit()
│   │   │   └── bot-tick.ts               ← Hot path — verify < tick interval
│   │   └── telemetry/writer.ts           ← Use canonicalize()
│   ├── forest/
│   │   ├── flight-recorder/
│   │   │   ├── audit-ledger.ts           ← Use canonicalize()
│   │   │   └── index.ts
│   │   ├── bot/
│   │   │   └── d1-persistence.ts         ← P1: recordBotManifest()
│   │   └── api/
│   │       ├── handlers/serialize-detail.ts ← P0: use canonicalize()
│   │       ├── auth-guard.ts             ← Sanitize errors
│   │       └── routes.ts
│   ├── app/api/killswitch-status/route.ts ← P1: verifyChain endpoint
│   └── lib/
│       ├── canonical-json.ts             ← NEW P0
│       └── error-codes.ts                ← NEW P1
```

---

## 8. Assumptions

| Assumption | Confidence | What Would Change It |
|------------|------------|---------------------|
| Trade-bot stays on Cloudflare Workers (edge) | High | If migrating to long-running Node, add Redis for rate limiter state |
| Paper trading v1; live deferred | High | If live needed now, wire live adapter to same ProviderChain + breaker |
| D1 ACID + `prev_hash` = sufficient tamper evidence | Medium | If regulatory requires external notarization, add anchor to public chain |
| Pure TS math sufficient (no WASM) | Medium | If numeric instability found in Black-Scholes/VaR, compile to WASM |
| 3 exchanges (Binance/Bybit/OKX) sufficient | Medium | If more needed, extend provider registry pattern |

---

*End of report. This file is the deliverable for fullstack-developer go-live implementation.*