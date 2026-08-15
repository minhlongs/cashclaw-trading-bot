# Vibe-Trading → CashClaw Trade-Bot: Pattern Mapping Report

**Source:** https://github.com/HKUDS/Vibe-Trading  
**Target:** `/Users/macbook/trade-bot` (Next.js 16 + Cloudflare Workers + D1)  
**Date:** 2026-08-16

---

## TL;DR

Vibe-Trading's **quantlib-as-a-service via MCP**, **provenance-tracked data fallback chain**, and **hash-chained audit ledger** are the three highest-value patterns to adopt. Map quantlib to a WASM module at `src/tree/quantlib/`, data fallback to `src/tree/exchange/provider/` with circuit-breaker chaining, and audit ledger to `src/forest/flight-recorder/` with cryptographic chaining. Skip: Electron desktop shell, sandboxed code execution, and full IM adapter matrix — over-engineering for v1.

---

## 1. Reframed Problem

**What we're actually deciding:** Which architectural patterns from Vibe-Trading (Python/FastAPI/Electron) translate to a TypeScript/Next.js/CFW trading bot without rewriting core logic — and the priority order to implement them.

**Requirements:**
- Trade-bot runs on Cloudflare Workers (edge), not a long-running Python process
- TypeScript/React stack; no Python runtime available
- Must preserve existing `src/tree/`, `src/forest/`, `src/land/` layer boundaries
- v1 scope: grid + mean-reversion bots, Binance/Bybit/OKX, paper + live trading

**Non-goals:**
- Desktop app (Electron)
- User-written strategy sandbox
- 16 IM channel adapters
- Purged cross-validation ML pipeline

---

## 2. Five Highest-Value Patterns from Vibe-Trading

| # | Pattern | Vibe-Trading Location | Why It Matters |
|---|---------|----------------------|----------------|
| 1 | **Quantlib as read-only MCP service** | `src/quantlib/` (265 fn) + MCP `quantlib_call` | Separates math from I/O; enables agentic tool use; testable in isolation |
| 2 | **Provenance-tracked data fallback chain** | `tools/loaders/` (24 sources) | Resilience against provider outages; audit trail for every price |
| 3 | **Hash-chained audit ledger (fsynced)** | Governance: manifest + ledger | Tamper-evident operations log; regulatory/compliance ready |
| 4 | **Circuit-breaker + half-open FSM** | Implicit in loader retries | Prevents cascade failures when a provider degrades |
| 5 | **Identity gate / OHLC evidence validation** | Core agent runtime | Rejects quotes outside recorded data; prevents phantom fills |

---

## 3. Mapping to Trade-Bot Codebase Structure

### Pattern 1: Quantlib → `src/tree/quantlib/` (WASM Module)

**Vibe-Trading:** 265 pure Python functions across 17 modules (options, bonds, credit, econometrics, VaR/CVaR/EVT, attribution, event studies, purged CV). Called via MCP `quantlib_call` — **read-only, no I/O**.

**Trade-Bot Mapping:**

| Vibe-Trading | Trade-Bot Location | Notes |
|--------------|-------------------|-------|
| `src/quantlib/options/` | `src/tree/quantlib/options/` | Black-Scholes, IV, Greeks — edge-compatible WASM |
| `src/quantlib/var_cvar_evt/` | `src/tree/quantlib/risk/` | VaR, CVaR, EVT for risk limits |
| `src/quantlib/attribution/` | `src/tree/quantlib/attribution/` | Performance attribution (Brinson) |
| `src/quantlib/econometrics/` | `src/tree/quantlib/stats/` | Rolling regressions, covariance |
| **MCP `quantlib_call`** | **Hono route `/internal/api/quantlib/*`** | TypeScript wrapper calling WASM; auth-guarded |

**Implementation Sketch:**
```
src/tree/quantlib/
├── index.ts              # Exports all modules
├── options/
│   ├── black-scholes.ts
│   ├── implied-vol.ts
│   └── greeks.ts
├── risk/
│   ├── var.ts
│   ├── cvar.ts
│   └── evt.ts
├── attribution/
│   └── brinson.ts
├── stats/
│   ├── rolling-ols.ts
│   └── covariance.ts
└── wasm/
    └── quantlib.wasm     # Compiled from Rust/AssemblyScript (or pure TS)
```

**Why WASM?** Pure TS math is fine for v1; WASM enables future parity with Python quantlib (same algorithms, numeric stability). Start with pure TS in `src/tree/quantlib/` — compile to WASM later if needed.

**Integration Point:** Bot strategies (`src/tree/bot/strategies/`) import from `src/tree/quantlib/` directly (no RPC). The `/internal/api/quantlib/*` route exposes for external agents/CLI.

---

### Pattern 2: Data Fallback Chain → `src/tree/exchange/provider/` (Chained Providers)

**Vibe-Trading:** 24 registered sources per market (A-share, HK, US, India, Korea, Canada, crypto). Fallback routing records **provenance** (which source served, unit, timestamp). Cross-source regression tests require ≤1% divergence.

**Trade-Bot Mapping:**

| Vibe-Trading | Trade-Bot Location | Notes |
|--------------|-------------------|-------|
| 24 loaders | 3 providers (Binance, Bybit, OKX) + extensible registry | Start with 3; registry pattern allows adding more |
| Provenance per load | `ExchangeProviderResponse { data, provenance: { source, unit, timestamp, latencyMs } }` | Wrap every response |
| Fallback ordering | `ProviderChain.execute()` — tries each until success | Circuit-breaker per provider (already exists!) |
| Regression tests | `vitest` cross-provider consistency suite | `src/tree/exchange/provider/__tests__/consistency.test.ts` |

**Existing Code Leverage:**
- `src/tree/exchange/provider/circuit-breaker.ts` — **already implements Pattern 4**
- `src/tree/exchange/provider/types.ts` — extend with `provenance` field
- `src/tree/exchange/provider/index.ts` — registry entry point

**Required Changes:**
```typescript
// src/tree/exchange/provider/types.ts (extend)
export interface ProviderProvenance {
  source: 'binance' | 'bybit' | 'okx' | string;
  unit: 'raw' | 'adjusted' | 'premium-index';
  timestamp: number;
  latencyMs: number;
  requestId: string; // correlation ID
}

export interface ExchangeProviderResponse<T> {
  data: T;
  provenance: ProviderProvenance;
}
```

```typescript
// src/tree/exchange/provider/chain.ts (new)
export class ProviderChain {
  constructor(private providers: ExchangeProvider[]) {}

  async execute<T>(fn: (p: ExchangeProvider) => Promise<T>): Promise<ExchangeProviderResponse<T>> {
    let lastError: Error | null = null;
    for (const provider of this.providers) {
      const cb = provider.getCircuitBreaker();
      if (cb.getState() === 'open') continue;
      
      try {
        const start = Date.now();
        const data = await fn(provider);
        return {
          data,
          provenance: { source: provider.name, unit: 'raw', timestamp: Date.now(), latencyMs: Date.now() - start, requestId: crypto.randomUUID() }
        };
      } catch (e) {
        lastError = e as Error;
      }
    }
    throw lastError ?? new Error('All providers exhausted');
  }
}
```

---

### Pattern 3: Hash-Chained Audit Ledger → `src/forest/flight-recorder/` (Cryptographic Chaining)

**Vibe-Trading:** Every run writes a hash manifest (prompt + skills + tool registry + package versions) + hash-chained fsynced audit ledger. Tamper-evident: even a self-rehashed edit is caught one record later.

**Trade-Bot Mapping:**

| Vibe-Trading | Trade-Bot Location | Notes |
|--------------|-------------------|-------|
| Hash manifest per run | `FlightRecorder.recordManifest()` on bot start | Hash: `SHA-256(config + env + codeVersion)` |
| Hash-chained ledger | `trade_events` table + `prev_hash` column | Each event links to previous via hash pointer |
| fsynced durability | D1 transactions (ACID) | D1 provides durability; add `prev_hash` for chaining |

**Required Schema Change:**
```sql
-- Add to trade_events table
ALTER TABLE trade_events ADD COLUMN prev_hash TEXT;
ALTER TABLE trade_events ADD COLUMN hash TEXT;
```

**Implementation:**
```typescript
// src/forest/flight-recorder/ledger.ts (new)
import { createServerClient } from '@/lib/db/client';
import type { D1Database } from '@/lib/db/types';

export class AuditLedger {
  private db: D1Database | null = null;
  private lastHash: string = '0'.repeat(64); // genesis

  private async getDb(): Promise<D1Database | null> {
    if (this.db) return this.db;
    this.db = createServerClient();
    return this.db;
  }

  private computeHash(payload: string, prevHash: string): string {
    const msg = `${prevHash}|${payload}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async append(eventType: string, detail: Record<string, unknown>): Promise<string> {
    const db = await this.getDb();
    if (!db) return '';

    const payload = JSON.stringify({ eventType, detail, timestamp: Date.now() });
    const hash = await this.computeHash(payload, this.lastHash);

    await db.prepare(`
      INSERT INTO trade_events (id, bot_id, event_type, detail_json, created_at, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      detail.botId ?? 'system',
      eventType,
      JSON.stringify(detail),
      Date.now(),
      this.lastHash,
      hash
    ).run();

    this.lastHash = hash;
    return hash;
  }

  async verifyChain(botId: string): Promise<{ valid: boolean; brokenAt?: number }> {
    const db = await this.getDb();
    if (!db) return { valid: false };

    const rows = await db.prepare(`
      SELECT hash, prev_hash, created_at FROM trade_events 
      WHERE bot_id = ? ORDER BY created_at ASC
    `).bind(botId).all();

    let prev = '0'.repeat(64);
    for (let i = 0; i < rows.results.length; i++) {
      const row = rows.results[i];
      if (row.prev_hash !== prev) return { valid: false, brokenAt: i };
      prev = row.hash;
    }
    return { valid: true };
  }
}
```

**Manifest Recording (bot start):**
```typescript
// In bot-manager.ts start() or FlightRecorder.recordBotStart()
async function recordManifest(botId: string, config: BotConfig) {
  const manifest = {
    botId,
    config: JSON.stringify(config),
    codeVersion: process.env.VERSION ?? 'dev',
    env: {
      nodeVersion: process.version,
      wranglerVersion: '1.x',
      // package hashes from lockfile
    },
    timestamp: Date.now(),
  };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(manifest)));
  // Store in audit_log or dedicated manifest table
}
```

---

### Pattern 4: Circuit Breaker FSM → Already Implemented ✅

**Location:** `src/tree/exchange/provider/circuit-breaker.ts`

**Status:** Complete triple-state FSM (`closed` → `open` → `half_open` → `closed`). Used by provider chain (Pattern 2).

**Action:** No new work needed. Ensure all exchange providers (live + paper) instantiate and use it.

---

### Pattern 5: Identity Gate / OHLC Evidence Validation → `src/forest/backtest/engine.ts` + Live Tick Validation

**Vibe-Trading:** "Strict OHLC evidence validation; refuses quotes outside recorded data."

**Trade-Bot Mapping:**

| Vibe-Trading | Trade-Bot Location | Notes |
|--------------|-------------------|-------|
| Backtest validation | `src/forest/backtest/engine.ts` | Already uses fetched candles; add gap detection |
| Live validation | `src/tree/bot/bot-tick.ts` | Validate incoming tick against exchange min/max |
| Phantom fill prevention | `src/tree/bot/bot-order-executor.ts` | Cross-check fill price with recent OHLC |

**Required Addition:**
```typescript
// src/forest/backtest/validation.ts (new)
export function validateOHLCSeries(candles: Candle[], maxGapMs: number = 3600000): { valid: boolean; gaps: number[] } {
  const gaps: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const expected = candles[i - 1].timestamp + intervalToMs(candles[i - 1]); // need interval context
    if (candles[i].timestamp - expected > maxGapMs) gaps.push(i);
  }
  return { valid: gaps.length === 0, gaps };
}
```

---

## 4. What NOT to Adopt (Over-Engineering for v1)

| Pattern | Vibe-Trading Location | Reason to Skip |
|---------|----------------------|----------------|
| **Electron desktop shell** | `desktop/electron/` | Web-first; no desktop requirement |
| **Sandboxed user code execution** | Agent runtime AST hardening | No user-written strategies in v1 |
| **16 IM channel adapters** | IM channels (Telegram, Discord, Slack, WhatsApp, QQ...) | Single Telegram bot is sufficient; add later if needed |
| **Purged cross-validation ML** | `quantlib/purged_cv/` | No ML strategies in v1 scope |
| **Shadow Account / SignalEngine** | Core agent runtime | Complex PIT-safe reconstruction; defer to v2+ |
| **Cost stack (STT, stamp duty, SEBI, GST)** | India-specific config | Not trading Indian markets in v1 |
| **Scheduled research cron** | `VIBE_TRADING_ENABLE_SCHEDULER` | Separate research product; not trading bot core |
| **MCP as primary transport** | Entire architecture | Overkill for internal TypeScript calls; use direct imports + Hono routes for external |

---

## 5. Implementation Priority

| Priority | Task | Owner Layer | Effort | Depends On |
|----------|------|-------------|--------|------------|
| **P0** | Add `provenance` to `ExchangeProviderResponse` + `ProviderChain` | `src/tree/exchange/provider/` | S | Circuit-breaker (done) |
| **P0** | Cross-provider consistency test suite (≤1% divergence) | `src/tree/exchange/provider/__tests__/` | S | P0 above |
| **P1** | `src/tree/quantlib/` — pure TS math modules (Black-Scholes, VaR, stats) | `src/tree/quantlib/` | M | None |
| **P1** | `AuditLedger` with hash-chained `trade_events` (+ `prev_hash` column) | `src/forest/flight-recorder/` | M | D1 migration |
| **P1** | Manifest recording on bot start (config + code version hash) | `src/forest/bot/d1-persistence.ts` | S | P1 ledger |
| **P2** | OHLC gap validation in backtest engine | `src/forest/backtest/engine.ts` | S | None |
| **P2** | Live tick validation in `bot-tick.ts` | `src/tree/bot/bot-tick.ts` | S | None |
| **P3** | `/internal/api/quantlib/*` Hono routes (expose for agents/CLI) | `src/forest/api/routes/` | S | P1 quantlib |
| **P3** | WASM compilation of quantlib (if numeric parity needed) | `src/tree/quantlib/wasm/` | L | P1 quantlib stable |

**Effort Key:** S = Small (1-2 days), M = Medium (3-5 days), L = Large (1-2 weeks)

---

## 6. Work Checklist

### Phase 1: Data Resilience (Week 1)
- [ ] Extend `src/tree/exchange/provider/types.ts` with `ProviderProvenance`
- [ ] Implement `ProviderChain` in `src/tree/exchange/provider/chain.ts`
- [ ] Wire `ProviderChain` into live + paper providers
- [ ] Add cross-provider consistency tests (Binance vs Bybit vs OKX spot prices)
- [ ] Verify circuit-breaker integration works end-to-end

### Phase 2: Quantlib Core (Week 2)
- [ ] Create `src/tree/quantlib/` directory structure
- [ ] Implement Black-Scholes, implied vol, Greeks (pure TS)
- [ ] Implement VaR/CVaR (historical + parametric)
- [ ] Implement rolling OLS + covariance
- [ ] Unit test against known values (Hull, NIST)

### Phase 3: Audit Ledger (Week 2-3)
- [ ] D1 migration: add `prev_hash`, `hash` to `trade_events`
- [ ] Implement `AuditLedger` class in `src/forest/flight-recorder/ledger.ts`
- [ ] Integrate into `FlightRecorder.recordEvent()` and `persistEvent()`
- [ ] Add `verifyChain()` admin endpoint
- [ ] Record manifest on bot start (config hash + code version)

### Phase 4: Validation Gates (Week 3)
- [ ] OHLC gap detection in backtest engine
- [ ] Live tick validation against recent OHLC bounds
- [ ] Phantom fill check in order executor

### Phase 5: External API (Week 4, optional)
- [ ] `/internal/api/quantlib/*` Hono routes
- [ ] WASM compilation evaluation

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Data availability** | ≥99.9% (3-provider fallback) | Synthetic monitor: 1 req/min per provider |
| **Cross-provider divergence** | ≤1% on spot prices | Nightly regression test suite |
| **Audit chain integrity** | 100% verifiable | `AuditLedger.verifyChain()` on deploy |
| **Quantlib numeric parity** | Match Python quantlib to 1e-10 | Test vectors from quantlib reference |
| **Circuit-breaker trip rate** | <0.1% of requests | Worker analytics / logs |
| **Manifest capture** | 100% of bot starts | Audit log query |

---

## 8. Assumptions

| Assumption | Confidence | What Would Change It |
|------------|------------|---------------------|
| Trade-bot stays on Cloudflare Workers (no long-running Node process) | High | If migration to Kubernetes/VMs happens, MCP + scheduler patterns become viable |
| v1 scope = grid + mean-reversion only | High | If user strategies added → sandbox pattern needed |
| 3 exchanges (Binance/Bybit/OKX) sufficient for v1 | Medium | If more exchanges needed → extend provider registry |
| D1 ACID + `prev_hash` = sufficient tamper evidence | Medium | If regulatory requires external notarization → add anchor to public chain |
| Pure TS math sufficient (no WASM needed yet) | Medium | If numeric instability found → compile to WASM from Rust |
| No ML strategies in v1 | High | If ML added → purged CV pattern becomes relevant |

---

## Appendix: File Map Reference

```
trade-bot/
├── src/
│   ├── tree/
│   │   ├── exchange/
│   │   │   └── provider/
│   │   │       ├── circuit-breaker.ts      ✅ Pattern 4 (done)
│   │   │       ├── types.ts                → extend with Provenance
│   │   │       ├── index.ts                → registry
│   │   │       ├── chain.ts                → NEW: Pattern 2
│   │   │       ├── binance-provider.ts     (or similar)
│   │   │       ├── bybit-provider.ts
│   │   │       ├── okx-provider.ts
│   │   │       └── __tests__/
│   │   │           └── consistency.test.ts → NEW: cross-provider tests
│   │   ├── quantlib/                       → NEW: Pattern 1
│   │   │   ├── index.ts
│   │   │   ├── options/
│   │   │   ├── risk/
│   │   │   ├── attribution/
│   │   │   ├── stats/
│   │   │   └── wasm/                       (future)
│   │   └── bot/
│   │       ├── bot-tick.ts                 → add Pattern 5 validation
│   │       ├── bot-order-executor.ts       → add Pattern 5 validation
│   │       └── strategies/
│   ├── forest/
│   │   ├── backtest/
│   │   │   ├── engine.ts                   → add Pattern 5 gap detection
│   │   │   └── validation.ts               → NEW: Pattern 5
│   │   ├── flight-recorder/
│   │   │   ├── index.ts
│   │   │   ├── ledger.ts                   → NEW: Pattern 3
│   │   │   └── flight-recorder-types.ts    → extend
│   │   ├── bot/
│   │   │   └── d1-persistence.ts           → add manifest recording
│   │   └── api/
│   │       └── routes.ts                   → add /internal/api/quantlib/*
│   └── worker.ts                           → Hono routes for quantlib API
└── wrangler.jsonc                          → D1 migration for prev_hash
```