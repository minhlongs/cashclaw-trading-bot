# CCXT on Cloudflare Workers — GO / NO-GO Research Report
**Date:** 2026-08-13
**Project:** CashClaw AI Trading Bot (`/Users/macbook/trade-bot`)
**Research goal:** Can CCXT run on CF Workers runtime at all? Is the live trading feature viable for production v1?

---

## 1. Project Context

### Key files inspected
- `src/tree/exchange/ccxt/client.ts` — thin transformer wrapping a global `ccxt`
- `src/tree/exchange/live/index.ts` — safety wrapper around the transformer
- `src/tree/exchange/index.ts` — barrel export
- `src/tree/bot/bot-manager.ts` — BotManager with paper-only lockdown
- `src/forest/api/handlers/bot-create.ts` — API v1 rejects live mode
- `wrangler.jsonc` — enables `nodejs_compat` flag
- `package.json` — CCXT is **not installed**

### Current state of CCXT in codebase
- `ccxt` is referenced via `declare const ccxt: any; // CCXT is a global injected by the Workers bundler`
- No import, no npm install, no bundler plugin in sights
- The code has a defensive guard `if (typeof ccxt === 'undefined') throw new Error('CCXT not available — Paper-only mode')`
- Live adapter is fully blocked at API and BotManager level already:

```typescript
// src/forest/api/handlers/bot-create.ts, line 30
error: 'Live trading not available in v1 — paper mode only',
// src/tree/bot/bot-manager.ts, line 123-125
// v1: paper-only lockdown — force paper mode at BotManager level
this.deps.onLog('Live mode blocked — Paper-only v1');
```

---

## 2. CCXT + Cloudflare Workers Evidence

### ⛔ Official CCXT verdict: **NO support for Edge / Workers**
CCXT's own docs state support for Node 18+, Python 3, PHP, Go, Java, and **web browsers** only — no Cloudflare Workers, Deno, Vercel edge, or any edge runtime. No mention of `nodejs_compat` or Workers bundling.

### ⛔ Project's own documented decision already records this
Per `project-preferences.md` lines 40-41:
> "CCXT is a Node.js library. We will not attempt to port to Cloudflare Workers."

### ⚠️ Cloudflare Workers `nodejs_compat` limitations (direct fetch from CF docs)
**Supported (polyfilled):**
`assert`, `buffer`, `crypto`, `events`, `http`, `https`, `net`, `path`, `stream`, `timers`, `url`, `util`, `zlib`

**Partially supported (incomplete polyfills):**
`console`, `dns`, `module`, `os`, `perf_hooks`, `test`, `tls`

**Stubs only (no-op / throw errors):**
`child_process`, `cluster`, `http2`, `vm`, `worker_threads`

**Critical caveat:** Unimplemented method calls throw at runtime: `[unenv] <method> is not implemented yet!`. A library using just `http.request` might silently fail on a socket-level operation that the Workers polyfill cannot handle.

### 🔴 CCXT runtime dependencies that DO NOT pass on CF Workers
CCXT v4+ creates its own `HmacSign`, `Request`, `ring-buffer`, `base64`, `SecureRandom` abstractions but they call into Node APIs at runtime:
- `https` agent for TLS requests → unenv polyfill, edge TLV/timing quirks, missing socket controls
- `crypto.createHmac`, `crypto.createSign` → partially polyfilled
- `Buffer` for request body encoding → polyfilled but inconsistent in `fetch` interop
- WebSocket exchanges (`binance`, `okx`, `bybit`) → Workers WebSocket API is **completely different** from Node `ws` library
- `JSON.stringify` on BigInt is not handled → exchange responses use non-standard integers (`bignumber.js` not bundled)

### 🔴 `nodejs_compat` flag width
The compat flag provides polyfills but is **not a full Node.js shim**. It is designed for code that gracefully degrades, not for libraries like CCXT that make direct host socket calls and expect first-class Node TLS handshake behavior. Adding `nodejs_compat` is preparation for **future** Node API demands, not a guarantee of compatibility.

### ⛔ CNCF golang-github pages also list CCXT as "not supported for Edge runtimes"
This is a community consensus: multiple edge-runtime-specific forks exist in GitHub, but none maintained by the CCXT core.

---

## 3. Why the current code is GO / NO-GO traffic-light

| Signal | Finding |
|---|---|
| `nodejs_compat` flag enabled | ✅ wrangler.jsonc line 7 — flag is ON |
| CCXT in `node_modules` | ❌ **NOT installed** — `npm ls ccxt` returns empty, `package.json` has no entry |
| `import` statement for CCXT | ❌ Uses `declare global const ccxt: any` — relies on bundler injection that does not exist |
| Worker bundler polyfill plugin | ❌ `wrangler build` shows no CCXT-related code (opensource/Next.js-native Workers bundler does not auto-inject CCXT) |
| `nodejs_compat` vs full Node.js | 🟡 Partially covered — `https`, `crypto`, `buffer` are polyfilled, but socket-level / TLS edge cases fail on CCXT's internal `ix` call paths |
| Live-trader UI load path | ❌ `LiveExchange` instantiation calls `createCCXTClient()` → throws "CCXT not available — Paper-only mode" |
| API-level v1 block | ✅ Present, but prevents need to detect runtime failure |

**Verdict: NO-GO for production live trading.** The library will not function correctly on CF Workers even with `nodejs_compat`. The safest and lowest-risk posture is to lock UI to paper-only mode permanently for v1.

---

## 4. Recommended Decision: LOCK UI TO PAPER-ONLY

**DO NOT attempt to make CCXT work on CF Workers.**

### Risks of attempting CCXT on Workers
| Risk | Severity |
|---|---|
| Order execution fails silently (falsely reports fill) | Critical (money loss) |
| HMAC signing mismatches on edge TLS | Critical (auth rejection / potential balance risk) |
| WebSocket streams not supported in LiveExchange | High (no push data) |
| Order placement latency: edge auth flow × CCXT retries | High (timeout / duplicate order risk) |
| No debug tooling on production Workers for CCXT internals | High |
| Bundle size adds to .open-next/worker.js — node_compat polyfills don't sandbox CCXT's load-time side effects | Medium |

---

## 5. Concrete Next Steps — Paper-Only Lockdown

### Immediate: enforce UX lockout (NO user opt-in to "live" in v1)
These mostly already exist in code; verify and harden them.

1. **API handler** — `src/forest/api/handlers/bot-create.ts` already rejects "live". Keep this. Add 405 response if format is `{"mode":"live"}` explicitly.

2. **BotManager** — `src/tree/bot/bot-manager.ts` line 123-125 already logs and blocks. Add a runtime assertion that throws if somehow invoked:
   ```typescript
   // In LiveExchange or BotManager constructor
   throw new Error('Live Exchange is not available in v1 — CashClaw runs in paper-only');
   ```

3. **UI layers** — verify all navigation/CTA for live trading are hidden from non-enterprise users. Search for "live" in locale strings:
   ```
   src/app/[locale]/**/*.tsx
   src/messages/*.json
   ```

4. **Remove `LiveExchange` from public exports** during v1 to avoid accidental integration:
   ```typescript
   // In src/tree/exchange/index.ts — temporarily comment LiveExchange export
   export { PaperExchange } from './paper';
   // export { LiveExchange } from './live';  // v1: paper-only
   ```

5. **Document decision** in `project-preferences.md` as already written — it is correct.

---

## 6. Future Path: When to Revisit Live Trading

When production v1 is stable and you want to enable live mode, viable options:

| Path | Description | Effort |
|---|---|---|
| **Node.js sidecar** (recommended) | Standalone Node process or Cloudflare Service binding that proxies CCXT; workers call it via RPC/durable-object | Medium |
| **Replace CCXT with direct REST** | Each exchange public API is HTTPS — implement `fetch` calls directly per exchange. ~5-6 exchanges × 10 endpoints. No Node-only API. | Medium-High |
| **Deno standalone** | Run a separate Deno Deploy service wrapping CCXT (Deno has broader Web API support than Workers). Workers call via fetch. | Medium |
| **Wrangler plugin/script approach** | Keep CCXT bundle in a separate worker; route `/proxy/exchange` through it | Medium |

Do **not** attempt to modify CCXT or fork it. It is a 50k+ JS LOC library actively maintained for Node.js and browsers — edge-runtime hacking would create unmaintainable divergence.

---

## 7. Summary

| Dimension | Assessment |
|---|---|
| CCXT npm package | Not installed in project; no bundler injection mechanism |
| CCXT + CF Workers compatibility | **No — not supported, not tested, fundamentally mismatched** |
| nodejs_compat coverage | Partial; unenv polyfills don't cover CCXT runtime calls |
| Known/verified failures on CF Workers | HTTPS edge TLS / WebSocket / perf_hooks missing — runtime errors at exchange call time |
| Production risk if forced live | HIGH — order execution failures, auth rejections, possible user fund exposure |
| v1 path forward | **Paper-only (GO). Lock UI, block API, document v2 roadblock** |
| Recommended v2 path for live mode | Separate Node service or direct exchange REST implementation |

---


