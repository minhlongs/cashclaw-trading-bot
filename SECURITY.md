# Security Policy & ADR-001 Paper-Only Safety Invariant

## 1. ADR-001 Paper/Backtest Safety Guarantee
CashClaw enforces a strict **PAPER/BACKTEST ONLY** invariant:
- No real-money order execution endpoints are permitted in `src/tree/`, `src/land/`, `src/forest/`, or `src/ee/`.
- All features, regime detectors, and alpha formulas must be strictly causal (`causal: true`, zero lookahead).
- Every backtest and simulation must account for exchange fees and configurable slippage.

## 2. Secret & Credential Hygiene
- Never commit `.env`, `.dev.vars`, API keys, or Cloudflare D1 tokens.
- Exchange API credentials stored for market-data inspection are encrypted at rest via WebCrypto AES-GCM (`src/lib/crypto.ts`).
- Webhook endpoints (such as NOWPayments IPN) must verify cryptographic HMAC signatures before mutating state.

## 3. Reporting a Vulnerability
If you discover a security issue, IDOR bypass, or lookahead data leak:
1. Do **not** open a public GitHub issue with exploit details.
2. Submit a private security advisory via GitHub Security Advisories on this repository.
3. We acknowledge reports within 48 hours and ship verified fixes with regression tests.
