# ADR-001: Resolution of CCXT-on-Workers Feasibility for Live Trading

## Status
**RESOLVED — NO-GO for CCXT on Edge Workers; Direct Web-API REST Architecture Selected for v2**

## Context
CashClaw was initially architected with simulated paper trading while evaluating live exchange execution capabilities via CCXT on Cloudflare Workers edge runtime. The known backlog in `docs/development-roadmap.md` flagged CCXT feasibility on Workers as unresolved.

Key requirements for live trading:
1. Low latency and reliable order placement and cancellation.
2. Cryptographic API request signing (HMAC-SHA256, RSA) without side-channel latency or secret leakage.
3. Strict fail-closed error handling to prevent duplicate order placement or phantom fills.
4. Edge isolate compatibility without reliance on Node.js-only system APIs (sockets, child processes, full TLS stack).

## Technical Findings
1. **Edge Runtime Incompatibility:**
   - CCXT relies on Node.js core libraries (`https`, `crypto`, `net`, `tls`, `stream`) that are only partially shimmed under Cloudflare Workers' `nodejs_compat` (`unenv`).
   - Sockets and raw TLS handshake abstractions required by CCXT internal HTTP transports throw at runtime on Cloudflare Workers.
   - CCXT WebSocket streaming implementations (`ccxt.pro`) depend on Node.js `ws` library, which is incompatible with the standard Cloudflare Workers WebSocket API.

2. **Bundle Overhead & Execution Risk:**
   - CCXT is a 50k+ LOC multi-exchange bundle that significantly inflates the Workers script size.
   - Any runtime failure in edge polyfills during live order execution creates catastrophic financial risk (e.g. silent fill mismatches, stuck orders, unhandled HMAC rejections).

3. **Existing Enforcements:**
   - `src/forest/api/handlers/bot-create.ts` explicitly rejects live bot creation requests with HTTP 400.
   - `src/tree/exchange/provider/routing-paper-only.test.ts` enforces compile-time (`@ts-expect-error`), runtime, and source-level tripwires forbidding live exchange instances from entering routing slots.

## Decision
1. **v1 Paper-Trading Permanence:**
   - CashClaw v1 remains strictly paper-only. No live trading orders or credentials can be executed on Cloudflare Workers in v1.
2. **v2 Live Trading Architecture:**
   - **Do not port or bundle CCXT into Cloudflare Workers.**
   - When live execution is provisioned for v2, use one of two verified edge-native patterns:
     - **Option A (Preferred Edge-Native):** Lightweight, direct REST exchange adapters built strictly on Web standards (`fetch`, `crypto.subtle.sign("HMAC", ...)`), perfectly native to Cloudflare Workers with zero Node shims or bundle bloat.
     - **Option B (Dedicated Execution Sidecar):** An isolated, containerized Node.js execution microservice running CCXT behind mutual TLS / authenticated Cloudflare Service Bindings, keeping edge Workers purely as orchestrators.

## Consequences
- **Positive:**
  - Zero risk of edge polyfill crashes during order execution.
  - Workers bundle size remains minimal and fast to deploy.
  - Zero capital risk in production v1.
  - Clean architectural boundary between strategy research/paper simulation and live order routing.
- **Negative:**
  - Direct live order execution directly from Cloudflare Workers requires writing lightweight direct REST clients for target exchanges (e.g., Binance, OKX, Bybit) in v2.
