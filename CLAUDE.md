# Project Context

## Current Status (2026-09-27)
- **Alpha Research OS** — Phase 10 shipped 2026-09-27: Data Quality Layer (Mission §15) — 9 OHLCV quality validators (`validate-monotonicity.ts`, `validate-duplicates.ts`, `validate-intervals.ts`, `validate-staleness.ts`, `validate-ohlc.ts`, `validate-volume.ts`, `validate-alignment.ts`, `validate-future-data.ts`, `validate-outage.ts`), composite master validator (`validator.ts`), fail-closed signal guard (`signal-fence.ts`), structured markdown diagnostic reporter (`reporter.ts`), and Forest evaluation seam (`evaluate.ts`); bad data produces `DATA_INVALID`, never silently producing a trading signal.
- **Prior phases:** 1 (evaluator engine), 2 (research queue + multiple-testing), 3 (microstructure data), 4 (cross-sectional engine, `b7d5454`), 5 (relative-value research, `b3f51fc`), 6 (alpha composition + portfolio engine + EXTREME cost, `985c9f1`), 7 (ResearchAgent safe role, `12584c6`), 8 (Paper / Shadow Observability, `5034549`), 9 (Strengthened Promotion Gates, `401cff1`)
- **System state:** Paper/backtest only. No live capital. 3,765/3,765 tests passing, quality gate green, 0 ESLint warnings, Knip clean.
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
