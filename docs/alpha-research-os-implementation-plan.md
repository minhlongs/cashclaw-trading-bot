# Alpha Research OS — Implementation Plan

**Status:** Phase 1 implemented · **Date:** 2026-08-23
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

### 3.6 Experiment Metadata Expansion

Additive expansion of the experiment engine (Mission §2 registry fields + §22 Q12).

- `src/forest/alpha/experiments/types.ts` — `Experiment` gains `hypothesisId?` / `parentId?`
  (lineage link); `ExperimentResult` gains `falsificationReason?`, `experimentHash`
  (SHA-256 over canonical JSON of config + seed + git commit via `src/lib/canonical-json.ts`),
  and `registryEntryId?`.
- `src/forest/alpha/experiments/runner.ts` (+ `runner-helpers.ts`) — computes the
  reproducibility hash at run start; populates `falsificationReason` from gate output on
  failed/killed runs. DI shape preserved.
- Persistence: `src/forest/alpha/persistence/{types,d1-adapter,json-adapter,d1-sql}.ts`
  extended with append-only `saveRegistryEntry` / `listRegistry` / `saveHypothesisNode` /
  `loadLineage`; `migrations/0009_research_registry.sql` adds `research_registry` and
  `research_hypotheses` tables (plain SQLite DDL, `CREATE TABLE IF NOT EXISTS`, additive only).
- Tests: `runner.test.ts` updated; hash determinism tested (same input → same hash).

**Untouched by design:** `src/forest/alpha/gate/*` (survival gate), promotion state machine,
killswitch, credentials, `src/land/`, middleware, worker cron, and all archived research code.

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
| 2 | Research queue (`PROPOSED → VALIDATING → RUNNING → EVALUATED → SURVIVED → FALSIFIED → ARCHIVED`) + multiple-testing defense (bootstrap CIs, permutation baselines, walk-forward consistency, overfitting proxy) | §9, §11 |
| 3 | Microstructure **data** infrastructure (L2/L3 depth stream + storage pipeline) feeding the Phase 1 contracts | §3A, falsification report |
| 4 | Cross-sectional engine: evaluation suite (gross/net return, turnover, costs, exposure, beta, Sharpe/Sortino, drawdown, regime performance), beta-aware sizing | §3C |
| 5 | Relative-value research: pair definitions, spread construction, hedge ratios, cointegration diagnostics, half-life — reusing `src/tree/alpha/correlation/` | §4 |
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

1. **Experiment hash.** SHA-256 over the canonical JSON serialization
   (`src/lib/canonical-json.ts`) of `config + seed + gitCommit`. Same input → same hash,
   always; determinism is itself tested. The pattern follows the existing hash-chained
   audit ledger (`src/forest/flight-recorder/audit-ledger.ts`).
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

*This plan documents only behavior that exists (Phase 1) or is committed in the phased
roadmap. It makes no promise of live trading — by design.*
