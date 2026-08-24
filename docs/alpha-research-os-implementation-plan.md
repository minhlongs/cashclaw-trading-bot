# Alpha Research OS — Implementation Plan

**Status:** Phase 1 + Phase 2 + Phase 3 implemented (Phase 3 shipped 2026-08-24) · **Date:** 2026-08-24
**Source:** Master Mission (`.orchestrate/latest/task.md`), execution plan (`.orchestrate/latest/plan.md`), falsification results (`docs/falsification-report.md`)

---

## 1. Overview / Mission

CashClaw is evolving from a paper-trading application that *ran* a research campaign into a
rigorous research operating system that *accumulates* research:

**ALPHA RESEARCH → FALSIFICATION → PAPER → SHADOW → PROMOTION OS**

### Falsification-first philosophy

The falsification campaign is accepted as a first-class research artifact:

- **30 hypothesis classes falsified** on SOLUSDT/ETHUSDT/BTCUSDT across 8h/1d/1h timeframes.
- **162+ walk-forward OOS tests, ~10,000 OOS trades** — no persistent out-of-sample positive
  expectancy after realistic costs (27 bps round-trip conservative stress model).
- The OHLCV / funding / OI / liquidation / sentiment signal space is **exhausted** at retail
  data resolution for the tested hypotheses.

Consequences:

- Do **not** retest dead hypotheses with different parameter combinations.
- Do **not** optimize until a backtest becomes profitable.
- Do **not** parameter-search our way out of falsification.
- The objective is to expand **information space** (microstructure, cross-sectional,
  relative-value), not parameter space.

Every hypothesis, feature, experiment, and kill becomes a machine-readable, reproducible,
lineage-tracked artifact — so the next information space can be explored without
rediscovering dead ideas.

### Final principle

Optimize CashClaw to produce **fewer, better-supported hypotheses** — not more trades.
If no durable edge exists, the correct output is `NO TRADE`. That is a successful result,
and "can the system prove that it should NOT trade?" is a first-class feature.

---

## 2. Safety Constraints (NON-NEGOTIABLE)

CashClaw remains **PAPER / RESEARCH ONLY**. These constraints override every other goal
in this plan and cannot be relaxed to make a phase easier to implement or a gate greener:

1. **No real-money execution.** No live orders, ever, from any code path in this project.
2. **No automatic live-order capability.** No code may add an autonomous path to live trading.
3. **Never bypass `MANUAL_APPROVAL`.** Human approval boundaries are preserved exactly.
4. **Never let an LLM place orders directly.** The architecture is
   `Alpha → Portfolio → Risk → Execution`; it is never `LLM → Order`. LLM output is treated
   as untrusted research input only.
5. **Never weaken safety infrastructure:** killswitches, credential barriers, circuit
   breakers, rate limits, audit logging, and survival gates are untouched by every phase.
6. **Future live-trading code must remain unreachable** without an explicit human promotion
   trigger. The promotion state machine stays capped below LIVE.
7. **The system must fail closed.** Bad data produces `DATA_INVALID`, not a trading signal;
   missing features stay `null`, never silently forward-filled.
8. **Do not lower quality gates to make CI green.** Zero `:any`, zero production `console.*`,
   zero new ESLint suppressions, existing coverage thresholds enforced.

---

## 3. Phase 1 Scope (Implemented)

Phase 1 is research-side only: six pure-domain components, zero execution-path changes.
All components respect the layer contract (`pages → forest → tree`; `land` coordinates;
`lib` shared) and Cloudflare Workers compatibility (no Node-only APIs).

### 3.1 Research Registry

Machine-readable record of every research entry, answering Mission §22 Q6/Q7/Q13
programmatically (how many tested, how many survived OOS, why each was killed).

- `src/tree/alpha/registry/types.ts` — `ResearchEntry` with all Mission §2 fields:
  hypothesis, data sources, feature set, regime, train/validation/OOS periods, costs,
  slippage, seed, git commit, result, falsification reason, status
  (`PROPOSED | RUNNING | SURVIVED | FALSIFIED | ARCHIVED`).
- `src/tree/alpha/registry/registry.ts` — pure functions: `createRegistry()`, `addEntry()`
  (rejects duplicate hypothesis+config hash), `falsifyEntry()`, `summarize()`,
  `toCanonicalJson()` for machine-readable export.
- `src/tree/alpha/registry/seed-falsified.ts` — the 30 falsified classes from
  `docs/falsification-report.md` seeded as `FALSIFIED` entries so dead hypotheses are
  machine-guarded against re-testing.
- `src/tree/alpha/registry/index.ts` — barrel (satisfies knip entry glob).
- Tests: `registry.test.ts` (dedup, immutability, summary math, seed integrity).

### 3.2 Hypothesis Lineage (Research Graph)

Lightweight lineage model preventing repeated rediscovery of dead ideas (Mission §12).

- `src/tree/alpha/hypothesis/lineage-types.ts` — `HypothesisNode`
  (`id`, `parentId`, `mutation`, `evidence`, `status`, `createdAt`); ID scheme
  `H001 → H001-A → H001-A-REGIME` (parent prefix + suffix, validated).
- `src/tree/alpha/hypothesis/lineage.ts` — pure graph functions: `createNode()`,
  `addChild()` (rejects cycles/self-parent, validates ID prefix), `descendants()`,
  `ancestors()`, `isDeadEnd()` (falsified with no live descendants).
- `src/tree/alpha/hypothesis/types.ts` — additive optional `parentId?` / `mutation?` on
  `AlphaHypothesis` (backward-compatible).
- Tests: `lineage.test.ts` (chain building, cycle rejection, dead-end detection).

### 3.3 Microstructure Feature Contracts

Causal feature declarations for the next information tier (Mission §3A). **Contracts only —
no data fetching**; the L2/L3 pipeline is a later phase per the falsification report.

- `src/tree/alpha/microstructure/contracts.ts` — declares the 9 features through the
  existing `declareFeature()` gate (which rejects non-causal declarations):
  `bid_ask_spread`, `order_book_imbalance`, `depth_imbalance`, `trade_imbalance`,
  `aggressive_volume`, `volume_delta`, `liquidity_shock`, `realized_spread`, `price_impact`.
  Sources: `'orderbook'` / `'trades'`; every declaration carries name, timeframe, source,
  lookback, availability, `causal: true`.
- `src/tree/alpha/microstructure/types.ts` — `MicrostructureSnapshot` (timestamped raw
  inputs) and feature output where missing data stays `null` — never forward-filled.
- Tests: `contracts.test.ts` (all 9 declarations pass; a `causal: false` declaration
  throws; explicit no-forward-fill guard).

### 3.4 Cross-Sectional Universe Abstraction

Multi-asset research foundation (Mission §3C).

- `src/tree/alpha/universe/types.ts` — `Universe` (`id`, `symbols`, `weighting`,
  `rebalanceRule`), `RankedAsset`, `CrossSectionalSnapshot`.
- `src/tree/alpha/universe/universe.ts` — pure deterministic functions: `createUniverse()`
  (validates non-empty, unique symbols), `rankAssets()`, `percentileNormalize()`,
  `selectLongShort(topN, bottomN)`, `marketNeutralWeights()` (weights sum ≈ 0),
  `basketNeutralize()`.
- Beta-aware sizing is declared as a type seam only (needs factor data — later phase).
- Tests: `universe.test.ts` (ranking ties, empty selection, weights-sum invariants).

### 3.5 Regime Transition Statistics

Extends — does not replace — the deterministic regime classifier (Mission §5).

- `src/tree/regime/transition-matrix.ts` — `buildTransitionMatrix(history)` producing a 7×7
  count matrix and transition probabilities from consecutive observed pairs only (causal by
  construction). Reports: transition probabilities, persistence probabilities, transition
  entropy (Shannon), average duration per regime, hazard (1 / avgDuration), and an
  `alphaDecayByRegime()` hook over a per-regime metric series. Sparse cells handled
  explicitly (zero counts → probability 0; entropy skips 0·log 0 terms).
- Consumes `RegimeHistoryStore.getHistory()` output directly.
- Tests: `transition-matrix.test.ts` (hand-computed fixture match; existing
  `leakage.test.ts` remains green).

### 3.6 Experiment Metadata Expansion — Actual Scope (corrected)

Phase 1 shipped the **tree-layer registry and hypothesis-lineage domains only**
(§3.1, §3.2). The earlier draft of this section overstated the experiment-engine
integration; the verified state is:

- `src/forest/alpha/experiments/types.ts` — **unchanged** by Phase 1. `Experiment` /
  `ExperimentResult` carry no `hypothesisId`, `parentId`, `experimentHash`, or
  `registryEntryId` fields.
- `src/forest/alpha/experiments/runner.ts` — **does not compute** a reproducibility hash.
  Run-level experiment hashing remains a standard (§6), not implemented behavior.
- Persistence: `src/forest/alpha/persistence/{types,d1-adapter,json-adapter}.ts` expose
  only `saveResult` / `loadResult` / `saveExperiment` / `loadExperiment` /
  `listExperiments` / `saveExperimentResult` / `loadExperimentResults` — **no**
  `saveRegistryEntry` / `listRegistry` / `saveHypothesisNode` / `loadLineage`.
- `migrations/0009_research_registry.sql` adds the `research_registry` and
  `research_hypotheses` tables (plain SQLite DDL, `CREATE TABLE IF NOT EXISTS`, additive
  only). These tables back the tree-layer domains of §3.1/§3.2; queue persistence is a
  **separate, new** D1 store introduced in Phase 2 (`migrations/0010_research_queue.sql`,
  `src/forest/alpha/persistence/queue-d1-store.ts`) — not an extension of the Phase 1
  adapters.

**Untouched by design:** `src/forest/alpha/gate/*` (survival gate), promotion state machine,
killswitch, credentials, `src/land/`, middleware, worker cron, and all archived research code.

---

## 3B. Phase 2 Scope (Implemented — shipped 2026-08-23)

Phase 2 adds the research queue and the multiple-testing defense layer (Mission §9, §11).
Research-side only: no UI, no API routes, no execution-path changes. All modules are pure
functions (tree/forest domain), Cloudflare Workers compatible.

### 3B.1 Research Queue (`src/tree/alpha/queue/`)

- `types.ts` — `QueueState` 7-state lifecycle:
  `PROPOSED → VALIDATING → RUNNING → EVALUATED → SURVIVED/FALSIFIED → ARCHIVED`;
  `QueueTrigger` events (`validate`, `withdraw`, `validation_passed`, `validation_failed`,
  `evaluation_complete`, `run_failed`, `survived`, `falsified`, `archive`);
  `ResearchQueueJob`, `TransitionRecord` (audit record per applied transition),
  `QueueJobSpec`, `QueueSummary`.
- `transitions.ts` — pure transition table: `canTransitionJob()`, `getJobTransition()`,
  `transitionJob()`, `isTerminalQueueState()`. Illegal transitions are rejected, never
  silently coerced.
- `queue.ts` — `createQueue()`, `enqueue()` (rejects duplicate jobs via `configHash` —
  `jobConfigHash(spec)` over the canonical job spec), `transitionQueueJob()`,
  `summarizeQueue()`.
- `validation.ts` — `validateJobSpec()` is **fail-closed**: an invalid spec is rejected
  with explicit reasons rather than enqueued with defaults.
- Tests: `queue.test.ts`, `validation.test.ts`.

### 3B.2 Multiple-Testing Defense (`src/forest/alpha/multiple-testing/`)

All seven Mission §9 safeguards, each a pure deterministic module:

| Safeguard | Module | Key functions |
|---|---|---|
| Bootstrap confidence intervals | `bootstrap.ts` | `bootstrapCi()`, `ciExcludesZero()` |
| Permutation / random-entry baseline | `permutation-baseline.ts` | `permutationTest()`, `compareAgainstRandomEntry()` |
| Multiple-testing counters | `counters.ts` | `emptyCounters()`, `incrementForJob()`, `computeCounters()` |
| PBO (overfitting) proxy | `overfitting-proxy.ts` | `pboProxy()`, `parameterSensitivity()` |
| Parameter sensitivity | `overfitting-proxy.ts` | `parameterSensitivity()` (normalized-spread threshold `DEFAULT_MAX_NORMALIZED_SPREAD = 0.5`) |
| Walk-forward consistency | `walk-forward-consistency.ts` | `assessWalkForwardConsistency()` |
| Cross-asset validation | `cross-asset-consistency.ts` | `assessCrossAssetConsistency()` |

- `evaluate.ts` — `evaluateSurvival()` composes the checks into a single `SurvivalVerdict`:
  **ANY check fails → verdict `falsified`**; only zero failures yields `survived`
  (`DEFAULT_SIGNIFICANCE_LEVEL = 0.05`).
- `seeded-prng.ts` — seeded PRNG (mulberry32) so every randomized check is deterministic.
- Tests: one `*.test.ts` per module (10 new test files, 184 Phase-2 tests total).

### 3B.3 Queue Persistence (`migrations/0010_research_queue.sql`)

A **new, separate** D1 store — not an extension of the Phase 1 persistence adapters:

- Tables: `research_queue_jobs`, `research_queue_events`, `research_testing_counters`
  (`CREATE TABLE IF NOT EXISTS`, additive only).
- `src/forest/alpha/persistence/queue-store-types.ts` — `ResearchQueueStore` interface:
  `appendJob()`, `appendEvent()`, `listJobs()`, `loadEvents()`, `appendCounterSnapshot()`;
  plus `QueueEventRecord`, `CounterSnapshot`.
- `src/forest/alpha/persistence/queue-d1-store.ts` — `D1ResearchQueueStore` /
  `createD1QueueStore(db)`. **INSERT/SELECT only** — append-only doctrine, no UPDATE paths.

**Untouched by design (Phase 2):** survival gate, promotion state machine, killswitch,
credentials, `src/land/`, middleware, worker cron, all API routes and UI.

---

## 3D. Phase 4 Scope (Implemented — shipped 2026-08-24)

Cross-sectional engine per Mission §3C: turn the Phase 1 cross-sectional primitives into a
causal evaluation engine for ranked multi-asset portfolios. Research-only — no API routes,
UI, worker cron, persistence, or execution-path changes.

### 3D.1 Portfolio Simulator (`src/tree/alpha/cross-sectional/`)

- `simulator.ts` — `runCrossSectionalSim(universe, snapshots, returnSeries, config)`.
  **Causality contract:** weights decided at snapshot t earn the return over t→t+1; the
  last snapshot is the terminal boundary (`periods = snapshots.length − 1`). Fail-closed
  on empty/misaligned inputs or symbols missing from the return panel (throw); a symbol
  missing one period's return → warning + exclusion, never forward-fill.
- `turnover.ts` — one-sided turnover `½·Σ|Δw|` (full rotation = 1.0) + `sumTurnover`.
- `weight-builder.ts` — default `selectLongShort` + equal weights or injected
  `WeighterFn`; cost fraction from explicit `costBps` override or `resolveStressConfig`
  fee+slippage+impact sum.
- Leakage invariance tests: mutating any snapshot at index > t does not change period-t
  results; shifting snapshots by one changes them (proves no off-by-one future use).

### 3D.2 Beta-Aware Sizing (`beta-sizing.ts`, `beta-tilt.ts`)

- `estimateRollingBetas` — rolling OLS via `computeFactorExposure`, window sliced
  strictly `[t−window, t)` before each sizing timestamp; null when insufficient aligned
  observations or zero benchmark variance (never invents beta=1).
- `scaleWeightsToTargetBeta` — targetBeta=0 achieved via `basketNeutralize` (division by
  βp is degenerate), not scaling; non-zero targets scale `w × targetBeta/βp`; fail-closed
  fallback returns input weights unchanged with `fallbackReason`.
- `inverseBetaTilt` — |w| ∝ 1/|β| with signs preserved and gross exposure maintained;
  same fail-closed rules.
- Benchmark is caller-supplied (`benchmarkReturns`) — required when targetBeta ≠ 0.

### 3D.3 Evaluation Suite (`src/forest/alpha/cross-sectional-eval/`)

- `return-metrics.ts` — annualized Sharpe/Sortino computed on the portfolio **return
  series** (not trade PnL); max drawdown on the compounded equity curve from 1.0.
- `attribution.ts` — long/short PnL attribution (precise + proportional fallback),
  cost attribution totals equal Σ per-period sim costs.
- `regime-breakdown.ts` — groups periods by caller-injected precomputed `RegimeLabel[]`
  only; length mismatch throws. No classifier instantiation (the deterministic classifier
  calls `Date.now()` internally).
- `report.ts` / `evaluate.ts` — `buildCrossSectionalReport` and the wire-in seam
  `evaluateCrossSectional(universe, snapshots, assetReturnSeries, config)` returning
  `{ sim, report, sizing }`; composition order validate → causal per-rebalance beta
  sizing → simulate → report; errors propagate verbatim.

### 3D.4 Untouched by design (Phase 4)

Walk-forward composition (deferred to Phase 6 — the seam follows the `DetectRegimeFn`
injection pattern), survival-gate consumption (Phase 2's `evaluateSurvival` can call this
seam later), persistence, API/UI/worker, all execution paths.

---

## 3E. Phase 5 Scope (Implemented — shipped 2026-08-25)

Mission §4: relative-value research — pair definitions, spread construction, hedge ratios,
rolling correlation, cointegration diagnostics, spread z-score, half-life, entry/exit rules,
transaction costs, beta neutrality. Doctrine: "Do not assume any pair is tradable. The
system must statistically validate the relationship first."

### 3E.1 Tree domain (`src/tree/alpha/relative-value/`)

- `runPairSpreadSim(panel, definition, config)` — causal pair-spread engine. Hedge ratio
  β(t) estimated from closes with timestamps strictly < t (mirrors the Phase 4
  `alignedPairs` strictly-before pattern); spread built from closes prior to t; decision
  at t earns the return t→t+1. Returns are derived internally from the same panel
  (`close[i+1]/close[i] − 1` attributed to i), so decision/return misalignment is
  structurally impossible.
- `estimateRollingHedgeRatio` — rolling OLS via `computeFactorExposure`, discriminated
  union return; five distinct fail-closed degeneracy classes (insufficient observations,
  zero x-variance, non-finite, |β| < 1e-9, β ≤ 0), never a silent β = 1.
- `buildSpreadSeries` — spread state at each decision time with partial-state semantics
  (β and spread survive during z-window warm-up; only zScore is null).
- `validatePairTradable` — conjunctive fail-closed gate run before first entry and every
  `revalidateEvery` periods: observation count, cointegration (p < 0.05 baked into
  `testCointegration`), finite half-life ≤ maxHalfLife, |correlation| ≥ minCorrelation.
  Failing pair → FLAT with tradeCount 0; NO TRADE is a first-class output.
- Entry-exit state machine — `flat | long_spread | short_spread`, entry/exit z thresholds,
  optional hard stop, null z ⇒ hold previous position with warning, config validation
  (entryZ > exitZ ≥ 0) throws.
- Leakage tests: mutate-future invariance (records before the mutation are byte-identical)
  and shift-boundary change, on both the spread builder and the full simulator.
- `src/tree/alpha/cost-stress.ts` — tree-local `StressMode` + `resolveStressConfig`
  mirroring the forest cost-model values exactly (16/27/50 bps totals), so tree domain
  code never imports `@/forest`.

### 3E.2 Forest evaluation (`src/forest/alpha/relative-value-eval/`)

- `evaluateRelativeValue(panel, definition, config) → { sim, report }` wire-in seam:
  validate → simulate → report; errors propagate verbatim.
- Parallel `RelativeValueReport` type (not extending `CrossSectionalReport`): annualized
  Sharpe/Sortino, max drawdown on the compounded equity curve, cost attribution equal to
  Σ per-period costs (runtime invariant, tolerance 1e-12), realized pair-beta diagnostic
  via `estimateRollingBetas` strictly-before windows.

### 3E.3 Constraints honored

All files kebab-case ≤ 200 lines, 0 `:any`, no `Math.random`/`Date.now` in domain logic,
no new ESLint suppressions, knip clean (forest barrel in `ignoreFiles`, tree barrel via
entry glob). 117 new tests; full suite 2619/2619 green ×3 consecutive runs; coverage
88.03% ≥ thresholds 82/85/85/82.

### 3E.4 Untouched by design (Phase 5)

Multi-pair portfolio scan (`findCointegratedPairs` + `filterDiversified` wiring), walk-forward
composition, beta-targeted sizing (beta neutrality ships as measurement/diagnostic only —
Mission §4 reading accepted pending mission-owner confirmation), a dedicated
rolling-correlation series in the report (covered instead as the per-revalidation
correlation diagnostic), persistence, API/UI/worker, all execution paths.

---

## 4. Known Simplifications / Escrow

Deliberate scope reductions from the Mission, recorded here so they are answered truthfully
and revisited deliberately — not silently forgotten.

- **C1 — Regime transition conditioning.** `RegimeTransitionMatrix` computes
  `P(regime[t+1] | regime[t])` (not the full `P(regime[t+1] | regime[t], features[t])` from
  Mission §5), because `RegimeResult` carries no feature vector. The feature-conditioned
  variant is deferred to a later phase, once regime observations persist feature snapshots.

- **C2 — Registry seed reproducibility granularity.** Registry seed entries (the 30 falsified
  classes from `docs/falsification-report.md`) are tagged `reproducibility: 'class-level'` so
  Mission §22 Q12 ("Is the result reproducible from a git SHA + dataset + seed?") is answered
  truthfully for pre-registry history: the markdown report has no per-run git SHA/seed, so
  full run-level reproducibility cannot be claimed for those entries. All experiments run
  through the post-Phase-1 engine carry full run-level hashes.

---

## 5. Future Phases (Phase 2+)

High-level roadmap derived from Mission §3–§19. Each phase follows the incremental protocol
(inspect → plan → implement → test → quality gate → docs → small reversible commit) and
remains bound by §2 safety constraints.

| Phase | Scope | Mission refs |
|---|---|---|
| ~~2~~ **IMPLEMENTED** (see §3B) | Research queue + multiple-testing defense — shipped 2026-08-23 | §9, §11 |
| ~~3~~ **IMPLEMENTED** — shipped 2026-08-24 | Microstructure **data** infrastructure: fail-closed REST polling ingestion (Binance `depth?limit=20` + `aggTrades`), append-only D1 storage (`migrations/0011_microstructure_data.sql`, 4 tables), causal feature computer for the 9 Phase 1 contracts with publication-lag `asOf` gate, worker cron wiring gated on `MICRO_INGEST_ENABLED` (default OFF). 93 new tests, 2412/2412 full suite | §3A, falsification report |
| ~~4~~ **IMPLEMENTED** — shipped 2026-08-24 | Cross-sectional engine: causal portfolio simulator (`runCrossSectionalSim` in `src/tree/alpha/cross-sectional/` — weights decided at snapshot t earn the return t→t+1, one-sided turnover, fees+slippage every sim, fail-closed), beta-aware sizing (`estimateRollingBetas` strictly-before-window OLS; targetBeta=0 via neutralization, never ÷βp; fail-closed fallback with `fallbackReason`; `inverseBetaTilt`), evaluation suite (`src/forest/alpha/cross-sectional-eval/` — Sharpe/Sortino on portfolio return series, drawdown on equity curve, long/short + cost attribution, exposure series, regime breakdown via injected labels only), wire-in seam `evaluateCrossSectional`. 90 new tests, 2502/2502 full suite. Walk-forward composition deferred to Phase 6 | §3C |
| ~~5~~ **IMPLEMENTED** — shipped 2026-08-25 | Relative-value research: causal pair-spread engine (`runPairSpreadSim` in `src/tree/alpha/relative-value/` — hedge ratio β(t) from data strictly < t, decision at t earns return t→t+1, internally derived returns), fail-closed tradability gate (`validatePairTradable` — cointegration + finite half-life + correlation floor, revalidated on cadence), 3-state entry-exit machine, tree-local cost-stress module (tree never imports forest), evaluation suite (`src/forest/alpha/relative-value-eval/` — parallel `RelativeValueReport`, cost attribution, realized-beta diagnostic), wire-in seam `evaluateRelativeValue`. 117 new tests, 2619/2619 full suite. Multi-pair scan + walk-forward deferred to Phase 6 | §4 |
| 6 | Alpha composition (`regime × alpha × confidence × expected cost × expected turnover`) + deterministic portfolio engine with risk applied after alpha generation; realistic cost model (NORMAL/CONSERVATIVE/ADVERSE/EXTREME) | §6, §7, §8 |
| 7 | `ResearchAgent` safe role only — hypotheses, explanations, summaries, next-experiment suggestions; never orders, promotion state, thresholds, or historical data | §10 |
| 8 | Paper/shadow observability: alpha/portfolio/risk decisions, hypothetical orders & fills, expected-vs-realized edge and slippage, feature snapshot hashes, data freshness, provider provenance | §14 |
| 9 | Strengthened promotion gates (15-point checklist incl. fee/slippage stress, parameter & cross-asset robustness, baseline comparison, reproducible experiment hash). The gate remains incapable of reaching LIVE automatically; shadow trading precedes any human promotion trigger | §13, §14 |
| 10 | Data-quality layer: timestamp monotonicity, duplicate/missing candles, stale data, impossible OHLC, cross-source alignment, future-data contamination → `DATA_INVALID`, never a silent signal | §15 |

Derivatives interaction features (Mission §3B: price × OI, funding × basis, liquidation ×
volatility, etc.) are folded into Phases 4–6 as the experiment engine gains explicit
interaction-hypothesis support.

---

## 6. Reproducibility Standards

Every experiment must be reproducible from a git SHA + dataset + seed (Mission §22 Q12).

1. **Experiment hash (standard, not yet implemented in the runner).** Target: SHA-256 over
   the canonical JSON serialization (`src/lib/canonical-json.ts`) of `config + seed +
   gitCommit`. Same input → same hash, always. The pattern follows the existing
   hash-chained audit ledger (`src/forest/flight-recorder/audit-ledger.ts`). The queue's
   `jobConfigHash()` (`src/tree/alpha/queue/queue.ts`) applies this pattern today for
   duplicate prevention; the experiment runner does not yet compute a run-level hash
   (see §3.6).
2. **Append-only evidence.** Research tables (`research_registry`, `research_hypotheses`)
   use append-only semantics: adapters expose save/list/load only — no UPDATE paths.
3. **Never mutate historical experiment rows.** A corrected or re-run experiment is a new
   entry referencing the old one via lineage, not an edit.
4. **Full provenance per entry.** Every registry entry records hypothesis, data sources,
   feature set, regime, train/validation/OOS periods, costs, slippage, seed, git commit,
   result, falsification reason, and status.
5. **Honest granularity.** Pre-registry history is marked `class-level` (see C2); only
   engine-produced runs claim run-level reproducibility.
6. **Causality as a reproducibility precondition.** Features pass `declareFeature()` only
   with `causal: true`; leakage-style invariance tests accompany every new domain module.

---

*This plan documents only behavior that exists (Phase 1 + Phase 2 + Phase 3) or is committed
in the phased roadmap. It makes no promise of live trading — by design.*
