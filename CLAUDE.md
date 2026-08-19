# Project Context

## Current Status (2026-08-19)
- **ProviderChain wiring** is complete (commit `8ca4a2d`) — fetchTicker/placeOrder route through ProviderChain with provenance metadata
- **Alpha Discovery** — all 10 phases complete; 24 hypothesis classes falsified (0 OOS positive expectancy); signal space exhausted on OHLCV/funding/OI data
- **System state:** Paper/backtest only. No live capital. 1892/1892 tests passing
- **Next work:** Awaiting user direction — no in-flight implementation plan

## Safety Rules
1. PAPER/BACKTEST ONLY — no real orders, no live trading
2. Never use future data in features, labels, regime detection, or execution
3. Every backtest must include fees and configurable slippage
4. Preserve existing tests and functionality
5. Small, reversible commits

## Code Standards
- TypeScript, 0 `:any` types
- File naming: kebab-case, max 200 lines
- No `console.log` in production
- Zod validation on API inputs
- YAGNI, KISS, DRY
- `npm test` must pass before commit
- Conventional commit messages

## Architecture Quick Reference
```
src/
├── tree/          # Data models, exchange adapters, provider chain
├── land/          # Exchange orchestration, bot control
├── forest/        # Strategies, backtest, dashboard, regime engine
├── quantlib/      # Quantitative functions (placeholder)
```

## Key Files
- `src/tree/exchange/provider/provider.ts` — ProviderChain + interface definitions
- `src/tree/exchange/provider/paper-provider-adapter.ts` — PaperExchangeProvider → TickerProvider/OrderProvider bridge
- `src/land/exchange-orchestration/index.ts` — ExchangeOrchestrator (wired to ProviderChain)
- `src/forest/backtest/` — Hypothesis sweep scripts (archived)
- `docs/falsification-report.md` — Final falsification results
- `docs/development-roadmap.md` — Project phases and backlog
