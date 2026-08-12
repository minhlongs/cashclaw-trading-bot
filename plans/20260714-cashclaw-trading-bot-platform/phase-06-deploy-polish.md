---
phase: 6
title: "Deploy + Polish — CF Workers + Audit"
status: pending
priority: P3
effort: 1d
dependencies: [phase-01, phase-02, phase-03, phase-04]
---

# Phase 6: Deploy + Polish

## Overview
Production deploy to CF Workers with full audit trail, monitoring, and hardening. Final quality gate before live trading.

## Requirements
- Functional: CF Workers deploy, D1 migrations applied, audit trail complete, Telegram alerts, SHA verification.
- Non-functional: Deploy time < 5min, zero secrets in code, 99%+ uptime target.

## Implementation Steps
1. Audit trail: Ensure every API call, order decision, and trade is logged to audit_log table.
2. Telegram integration: Wire @Sophia_Bbot-style notifications for bot events (fill, error, killswitch).
3. Wrangler config: secrets (exchange API keys via `wrangler secret put`), D1 binding, KV for WS cache.
4. Deploy script: `npm run deploy:full` — build + wrangler deploy + SHA verify.
5. Health check endpoint: `/api/health` — returns bot status, D1 connectivity, last trade time.
6. Error handling: Global error boundary, structured logging (no console.log), Sentry or similar.
7. Final QA: Run full wireframe review against all 5 pages.
8. Paper trading dry run: 24h test with 3 bots on Binance testnet, zero real orders.

## Security Checklist
- [ ] Zero console.log in src/ (use logger utility)
- [ ] Zero :any types in TypeScript
- [ ] All API inputs validated with Zod
- [ ] API keys encrypted in D1, never in code or env files
- [ ] CORS configured for production domain only
- [ ] Rate limiter active on all exchange endpoints

## Deploy Verify (per SOP)
```
LOCAL_SHA=$(git rev-parse HEAD | cut -c1-8)
LIVE_SHA=$(curl -s https://<domain>/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)
echo "Local: $LOCAL_SHA Live: $LIVE_SHA"  # must match
HTTP 200 on production URL
```

## Success Criteria
- [ ] `npm run build` passes 0 errors
- [ ] `npm test` passes all tests
- [ ] `wrangler deploy` succeeds
- [ ] SHA match verified
- [ ] 24h paper trading dry run: zero real orders, all trades logged to D1
- [ ] Dashboard loads < 2s on 3G
- [ ] Telegram alerts working for all bot events

## Risk Assessment
- **Risk:** Binance testnet resets weekly → paper trading data loss. **Mitigation:** Export testnet trades to D1 daily.
- **Risk:** Wrangler deploy breaks due to CF Workers cold start. **Mitigation:** Staged deploy (staging → production), health check gate.
