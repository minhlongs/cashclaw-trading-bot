---
title: CashClaw AI Trading Bot Platform
status: pending
created: 2026-07-14
stack: TypeScript, Next.js 16, Hono, CF Workers (Paid), D1, Wrangler
mode: --hard
---

# CashClaw AI Trading Bot Platform

Bootstrap new project: internal trading bot tool → future multi-user SaaS.

## Phases

| Phase | Title | Status | Priority |
|-------|-------|--------|----------|
| 01 | Foundation — Scaffold, DB, Auth | complete | P1 |
| 02 | Exchange Integration — API + WS | complete | P1 |
| 03 | Bot Engine — Grid + Mean Rev | complete | P1 |
| 04 | Dashboard UI — 5 Pages + i18n | complete | P2 |
| 05 | Backtesting — Jesse → D1 Pipeline | complete | P2 |
| 06 | Deploy + Polish — CF Workers + Audit | complete | P3 |

## Dependencies

- Phase 01 → all others (foundation)
- Phase 02 → Phase 03 (exchange data feeds bot engine)
- Phase 03 → Phase 04 (bot engine powers dashboard)
- Phase 05 can run parallel with 03/04

## Acceptance Criteria

- [ ] `npm run build` passes with 0 TypeScript errors
- [ ] Paper trading logs trades to D1 without placing real orders
- [ ] Grid bot runs on 1-min cron, places simulated orders on Binance testnet
- [ ] Dashboard shows live P&L, bot status, trade history
- [ ] VN + EN locale toggle works end-to-end
- [ ] Audit trail logs every API call + order decision

## Design References

- Design guidelines: `docs/design-guidelines.md`
- Wireframes: `docs/wireframes/*.html`

## Open Questions

- Binance testnet WS endpoint stability (need to verify during Phase 02)
- D1 concurrent write pattern for multi-bot trade logging (will surface in Phase 03)
