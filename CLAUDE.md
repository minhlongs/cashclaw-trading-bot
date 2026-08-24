# Project Context

## Current Status (2026-08-25)
- **Alpha Research OS** — Phase 5 of 6 complete. Phase 5 relative-value research shipped 2026-08-25 (PR #5, commit `b3f51fc`): causal pair-spread engine + fail-closed tradability gate + relative-value evaluation suite in `src/tree/alpha/relative-value/` and `src/forest/alpha/relative-value-eval/`
- **Prior phases:** 1 (evaluator engine), 2 (research queue + multiple-testing), 3 (microstructure data), 4 (cross-sectional engine, `b7d5454`)
- **System state:** Paper/backtest only. No live capital. 2619/2619 tests passing, quality gate green, coverage 88.03%
- **Next work:** Phase 6 — composition (multi-pair scan, walk-forward, survival-gate consumption of the evaluation seams). See `docs/alpha-research-os-implementation-plan.md` §5.

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
