# Project Context

## Current Status (2026-08-25)
- **Alpha Research OS** — All 6 phases complete. Phase 6 composition shipped 2026-08-25 (PR #6, commit `985c9f1`): alpha composition scoring, 9-overlay portfolio engine, EXTREME cost mode, forest evaluation seam with leakage-isolation suite
- **Prior phases:** 1 (evaluator engine), 2 (research queue + multiple-testing), 3 (microstructure data), 4 (cross-sectional engine, `b7d5454`), 5 (relative-value research, `b3f51fc`)
- **System state:** Paper/backtest only. No live capital. 2671/2671 tests passing, quality gate green, coverage 88.22%
- **Next work:** Known backlog items (multi-pair scan wiring, walk-forward composition, rolling-correlation, import unification, survival-gate consumption). See `docs/development-roadmap.md` §Known Backlog.

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
