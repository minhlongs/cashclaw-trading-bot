# Deployment Safety Boundary

**Status:** ACTIVE — deployment is infrastructure-only

## What was deployed

| Item | Value |
|---|---|
| Worker | `cashclaw-trading-bot` |
| URL | `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev` |
| Health | `{"status":"ok","environment":"production","checks":{"db":"ok","circuitBreaker":"ok","rateLimiter":"ok"}}` |
| D1 | `cashclaw-db` (`c054f5a3-e7b9-42f0-88eb-dfffc4f8feae`) |
| R2 | `cashclaw-opennext-cache` |
| Secrets | `ADMIN_TOKEN`, `ENCRYPTION_KEY` (AES-256-GCM, 64 hex chars) |

## What this deployment does NOT enable

- **No live trading.** No `placeOrder` calls are routed to a real exchange. The ProviderChain routes through mock/test providers in the research layer; production execution paths remain disabled.
- **No real capital.** All strategy evaluation is PAPER/BACKTEST ONLY.
- **No strategy is presented as profitable.** All 24 hypothesis classes tested across the alpha discovery campaign were falsified (0 OOS positive expectancy). See `docs/falsification-report.md`.

## Safety rules still in force

1. DO NOT place real orders.
2. DO NOT enable live trading.
3. DO NOT modify production execution behavior without explicit research-interface requirement.
4. Every backtest includes fees + configurable slippage.
5. Never use future data in features, labels, regime detection, or execution.

## Rollback

```bash
npx wrangler rollback
```

## Verified gates before deploy

- `npm run type-check` — 0 errors
- `npm run lint` — 0 errors, 0 warnings
- `npm test` — 1935/1935 passing
- `npm run build` — clean exit 0
