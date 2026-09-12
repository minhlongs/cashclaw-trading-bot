---
name: project-direct-rest-okx-bybit-plan
description: Implementation plan for expanding direct REST engine with OKX and Bybit edge-native WebCrypto clients
metadata:
  type: project
---

2026-09-11 plan written at `.orchestrate/latest/plan.md` to expand CashClaw's edge-native Direct REST engine (`src/tree/exchange/direct/`) with OKX and Bybit clients.

**Key Architecture Decisions & Invariants:**
- ADR-001 paper-only invariant preserved: public market data (`ping`, `getServerTime`, `fetchTicker`) + stateless signed request generator (`createSignedRequest`). No live order execution.
- Pure WebCrypto (`crypto.subtle`) with zero Node.js standard library imports (`node:crypto`, `node:buffer`).
- OKX signature requires Base64 HMAC-SHA256, implemented via standard `btoa` over binary string. Headers: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`, optional `x-simulated-trading: 1`.
- Bybit signature requires Hex HMAC-SHA256. Headers: `X-BAPI-API-KEY`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`, `X-BAPI-SIGN`.
- Strict file size limit: <= 200 LOC per file. Modular test decomposition: separate `*.test.ts` (happy path) from `*-errors.test.ts` (error envelope) and per-exchange signer test vectors.
- 100.00% statement, branch, function, line coverage floor on `src/tree/exchange/direct/**`.

**Why:**
CCXT is a NO-GO on Cloudflare Workers edge runtime (ADR-001). Direct lightweight REST clients provide edge-compatible multi-exchange market feeds and read-only paper reconciliation.

**How to apply:**
Review implementations against pure edge standards, SSRF guards, envelope error parsing, and strict 200 LOC ceilings.
