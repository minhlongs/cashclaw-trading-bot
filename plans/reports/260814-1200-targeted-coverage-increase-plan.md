## Targeted Coverage Increase Plan

### Scope
1. `src/tree/bot/bot-strategy.ts` (coverage ~50.9%)
2. `src/forest/bot/d1-hydration.ts` (coverage ~70%)

### What to test
**bot-strategy.ts**
- `initializeStrategy`:
  - grid config with `strategyChain`
  - mean_reversion config without chain
  - unknown strategy branch (should throw)
- `evaluateStrategyChain`:
  - node returns signal
  - chain returns null
  - context assembly uses balance = capital + totalPnl

**d1-hydration.ts**
- `hydrateFromD1`:
  - returns early when `createServerClient()` is null
  - restores state for valid row
  - calls `onError` when `JSON.parse(config_json)` fails
- `loadAllBotsFromD1`:
  - skips already-hydrated bot ID
  - continues after bot restore failure with `onError`

### Files to add
- `/Users/macbook/trade-bot/src/tree/bot/bot-strategy.test.ts`
- `/Users/macbook/trade-bot/src/forest/bot/d1-hydration.test.ts`

### Mock boundaries
Mock only:
- `@/lib/db/client`
- `@/lib/db/repositories`
- `@/tree/bot`
- `@/tree/bot/strategies/grid`
- `@/tree/bot/strategies/mean-reversion`
- `@/tree/bot/strategy-chain`

No production code edits.

### Verification
- `npm run type-check`
- `npx vitest run src/tree/bot/bot-strategy.test.ts src/forest/bot/d1-hydration.test.ts`
- `npm run test` (full suite)
