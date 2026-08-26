# Project Context

## Current Status (2026-08-26)
- **CashClaw × Vibe-Trading Alpha Zoo Evaluator + IC/IR Falsification Bridge Phase 3** — Complete. Zoo alpha evaluator + factor IC/IR falsification bridge: causal operator parser + evaluator kernels (`operator-{ast,tokenizer,parser,kernels,cross,pair,evaluator}.ts`, 17-op vocabulary, append-invariant, no lookahead), factor panel + IC/IR analysis (`factors/{panel,ic-analysis,ic-metrics,ic-quantile}.ts` — forward returns, bootstrap CI, Spearman/Pearson, quantile spread, turnover), forest-layer `runZooFalsification` bridge (import → parse → evaluate → analyzeIc → bootstrap CI + permutation + walk-forward shim; three-terminal verdicts; fail-closed Σ≡N; deterministic FNV-1a32 seeds). Seed run `scripts/zoo-phase3-falsify.ts` executes the committed 12-entry phase-2 manifest on the cached 3-symbol Binance 1d panel (730 bars) with all zoo market tags mapped to the crypto universe (documented adaptation, Phase 2 D4 precedent) → committed artifact `plans/reports/zoo-phase3-falsification-report.json` (0 alive / 2 falsified / 2 not-evaluable / 8 import-skipped, Σ≡12) + `docs/zoo-seed-falsification-report.md` with external-validity caveat (equity-designed alphas on 3-asset crypto panel = pipeline demonstration, not tradable conclusion). Consistency test pins the committed artifact byte-for-byte. All pure — no I/O in tree, no eval/exec, WebCrypto only. 158 new tests (3152 total), coverage 89.64% ≥ 89.09% baseline.
- **Prior: CashClaw × Vibe-Trading Alpha Zoo Adapter Phase 2** — Complete. Pure tree-layer ingestion of Vibe-Trading zoo metadata into validated `ResearchHypothesis` candidates: compiler split (`compile-stages.ts`, dead placeholder seed removed), zoo metadata Zod schemas (snake_case verbatim), operator vocabulary + fail-closed formula normalizer, fail-closed `AlphaImportReport` (7 buckets, Σ ≡ N enforced), deterministic `AlphaZooAdapter` with canonical-payload dedup, 12-entry seed manifest transcribed verbatim from vibe-trading @ `5cd08ee1bd5c` + golden audit test pinning per-entry outcomes (4 adapted / 7 unsupported / 1 validation-error). All pure — no I/O, no eval/exec, WebCrypto only. 82 new tests (2994 total).
- **Prior: CashClaw × Vibe-Trading Research Contracts Phase 1** — Complete. Tree-layer purity research contracts: `ResearchHypothesis` + `ResearchGoal` Zod schemas with mechanism gate, `AlphaProvenance` (formula hash + normalized representation + validation), `EvidenceObject`/`ResearchLineage` append-only lineage graph, deterministic `AlphaCompiler` pipeline (6 stages: Zod+mechanism gate → causal validation via `declareFeature(causal:true)` → feature validation → data/universe window coverage → cost validation via `resolveStressConfig` → emit `ExperimentSpec` with SHA-256 specId). All pure — no I/O, no eval/exec, WebCrypto only. 109 new tests (2912 total), coverage 88.86% ≥ 88.22% baseline.
- **Alpha Research OS** — All 6 phases complete. Phase 6 composition shipped 2026-08-25 (PR #6, commit `985c9f1`): alpha composition scoring, 9-overlay portfolio engine, EXTREME cost mode, forest evaluation seam with leakage-isolation suite
- **Prior phases:** 1 (evaluator engine), 2 (research queue + multiple-testing), 3 (microstructure data), 4 (cross-sectional engine, `b7d5454`), 5 (relative-value research, `b3f51fc`)
- **System state:** Paper/backtest only. No live capital. 3152/3152 tests passing, quality gate green, coverage 89.64%
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
