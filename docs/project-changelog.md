# Project Changelog — CashClaw Trade Bot

## v1 Paper-Trading Platform

### Core Platform
- Next.js 16 App Router scaffold, bilingual i18n (vi/en), D1 schema (users/bots/trades/events/snapshots), paper exchange simulator, grid + mean-reversion strategy chain.

### Data Integrity — Commit `e8228b5`
- Dashboard, bots, and bot-detail pages now read real data from D1 (`trade_events`, `capital_snapshots`). Fabricated figures removed.

### Auth + Trade Events — Commits `363db6d`, `3afc1e9`
- Session-cookie authentication with D1 `user_sessions`. Trade event telemetry wired to flight recorder.

### Security Hardening — Commit `7e4cb92`
- CORS domain restriction (no more wildcard `origin: '*'`). Middleware session validation against D1. Backtest wiring fixed. Notification persistence wired.

### Fail-Closed Auth — Commit `f1c0949`
- Sensitive routes reject when D1 is unavailable. Spoofable `x-user-id` header stripped in middleware.

### Monitoring — Commit `69e683a`
- Real health, metrics, and killswitch cards from D1. In-memory BotManager reads dropped in favor of direct D1 queries.

### Killswitch Durability — Commit `ab7424c`
- Daily halt state persisted to D1 so it survives Workers cold starts.

### Credential Encryption — Commit `cae6dbd`
- Exchange credentials encrypted at rest. Secrets masked in API responses.

### Bot Detail Hydration — Commit `16c6f45`
- Bot detail and control handlers hydrate from D1 before serving.

### E2E Smoke Tests — Commit `bfa4697`
- Customer-journey API smoke tests covering auth, bot lifecycle, settings, and monitoring flows.

### Quality Push (Phase L) — Commit `1a2cd16`
- ESLint: 86 → 0 warnings. Coverage: 75% → 87.5% (statements), 1628 tests across 122 files. Coverage thresholds ratcheted (statements 80, branches 85, functions 85, lines 80). Follow-up type-fix commit `ffb81a8`.

### Backtest Wiring — Commit `9f5bd1f`
- Backtest page now loads real bots from D1 into the selector (was always empty).

### Project Documentation — Commit `M` (current)
- README.md, system architecture, code standards, development roadmap, project changelog. Lint tightened to zero-warning gate (`--max-warnings 0`).
