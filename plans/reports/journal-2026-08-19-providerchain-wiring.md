# Journal — ProviderChain Wiring (2026-08-19)

## What was done
Wired `ProviderChain` into `ExchangeOrchestrator` so `fetchTicker` and `placeOrder`
route through the chain (enabling future failover + provenance) instead of calling
`PaperExchangeProvider` directly.

## Files changed
| File | Change |
|------|--------|
| `src/tree/exchange/provider/provider.ts` | `TickerProvider`/`OrderProvider` return raw `Ticker`/`OrderResult` (was `ProviderResult<T>`) — fixes double-wrap |
| `src/tree/exchange/provider/paper-provider.ts` | Added `getCircuitBreaker()` getter |
| `src/tree/exchange/provider/paper-provider-adapter.ts` | NEW: `PaperProviderAdapter` bridges `PaperExchangeProvider` → `TickerProvider & OrderProvider` |
| `src/tree/exchange/provider/index.ts` | Export `PaperProviderAdapter` |
| `src/land/exchange-orchestration/index.ts` | Route fetchTicker/placeOrder through ProviderChain; add `chains`/`lastProvenance` maps; `getLastProvenance()` accessor; `reportError` on chain failure |
| `src/land/exchange-orchestration/index.test.ts` | Updated mock factory + provenance tests |
| `src/land/exchange-orchestration/orchestration-extended.test.ts` | Updated mock factory + provenance tests |
| `src/tree/exchange/provider/paper-provider-adapter.test.ts` | NEW: 6 adapter tests |

## Key decisions
- **Raw interface returns (Phase 0):** `ProviderChain.execute` wraps in `ProviderResult`, so the adapter must return raw types. Changed the interfaces rather than having the adapter wrap — cleaner, and `provider.test.ts` already asserted on raw shapes.
- **Adapter `name = exchangeId`:** provenance shows the exchange name (`binance`), not the internal `provider:binance:paper` id. Deliberate; consumers read `provenance.provider` as a human-readable exchange label.
- **YAGNI:** `fetchOrderBook`/`cancelOrder`/`fetchOrder`/`fetchBalances` stay direct provider calls — ProviderChain only supports ticker + order methods.
- **`getOrCreateProvider` still builds chains:** so auto-provisioned providers also get chain wiring.

## Quality gates
- Tests: **1892/1892 pass** (tester verified, ran twice, no flakiness)
- Lint: **0 errors, 0 warnings**
- `tsc --noEmit`: **0 errors**
- `npm run build`: **clean**
- Adapter coverage: **100%** statements/functions/branches

## Review outcome
- **code-reviewer: CONDITIONAL PASS** — one blocking item (C1: untracked adapter files would break fresh clones/CI). Fixed by `git add`-ing both files before this journal.
- Non-blocking items accepted as-is: adapter `name` simplification (documented), redundant circuit-breaker check in `placeOrder` (intentional fast-fail), `reportError` `string | undefined` narrowed with `?? 'Unknown error'`.

## Remaining risk
- None blocking. The `{} as Killswitch` default-killswitch hazard in the orchestrator constructor is pre-existing and out of scope.