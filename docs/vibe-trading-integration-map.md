# Vibe-Trading Integration Map

**Status:** Phase 0 — Recon Complete
**Date:** 2026-08-26
**Classification Policy:** COPY / ADAPT / REIMPLEMENT / WRAP / REJECT

---

## Summary

This document classifies every candidate Vibe-Trading component against CashClaw's architectural invariants. The guiding principle:

> **Vibe-Trading proposes and explores. CashClaw validates, falsifies, risk-controls, and promotes.**

CashClaw remains the source of truth for quantitative evidence.

---

## Integration Classifications

### COPY — Pure research metadata, schemas, documentation concepts

| Vibe-Trading Component | CashClaw Target | Rationale |
|------------------------|-----------------|-----------|
| Alpha Zoo metadata schemas (alpha name, category, description, references) | `src/tree/research/alpha/zoo-metadata.ts` | Static knowledge, no runtime coupling |
| Factor taxonomy definitions (momentum, value, volatility, etc.) | `src/tree/research/factors/taxonomy.ts` | Classification vocabulary only |
| Research goal concept schemas (objective, constraints, success criteria) | `src/tree/research/goals/types.ts` | Pure data contracts |
| Swarm task definition schemas (propose, critique, refine) | `src/tree/research/swarm/task-types.ts` | Message formats only |
| IC/IR concept definitions | `src/tree/research/factors/ic-ir-types.ts` | Mathematical definitions |
| Portfolio optimizer concept definitions (mean-variance, risk parity, HRP) | `src/tree/research/portfolio/optimizer-types.ts` | Interface contracts only |

---

### ADAPT — Research abstractions requiring CashClaw-native implementation

| Vibe-Trading Component | CashClaw Target | Adaptation Required |
|------------------------|-----------------|---------------------|
| Alpha metadata structure | `AlphaHypothesis` (extends `src/tree/alpha/hypothesis/types.ts`) | Add `expectedMechanism`, `provenance`, `costAssumption`, `generatedBy`, `experimentVersion` |
| Factor taxonomy → CashClaw factor engine | `src/tree/alpha/factors/` (extend) | Map to CashClaw's `FeatureDeclaration` + causal validation |
| Research goal → Experiment binding | `ResearchGoalAdapter` + `ExperimentSpec` | Every experiment MUST attach to a research goal |
| Swarm task definitions | `ResearchWorkerAdapter` task queue | Async job queue with `PROPOSED → VALIDATING → QUEUED → RUNNING → EVALUATED` states |
| IC/IR calculations | `src/tree/alpha/factors/ic-ir.ts` (new) | Implement with CashClaw's deterministic backtest + regime conditioning |
| Portfolio optimizer concepts | `src/tree/alpha/portfolio/optimizer.ts` (extend) | Research candidates ONLY; CashClaw risk engine remains authoritative |

---

### REIMPLEMENT — Must obey CashClaw's invariants

| Vibe-Trading Component | CashClaw Implementation | Invariants Enforced |
|------------------------|-------------------------|---------------------|
| **Backtest engines** (vectorized, event-driven) | `src/forest/backtest/` (existing) | Causal features, fee/slippage/market impact, walk-forward, deterministic |
| **Alpha compiler / formula evaluator** | `AlphaCompiler` (new: `src/tree/research/alpha/compiler.ts`) | Causal validation gate, feature validation, data availability, universe validation, cost validation → deterministic experiment plan |
| **Alpha Zoo formula import** | `AlphaZooAdapter` (new: `src/tree/research/alpha/zoo-adapter.ts`) | Parse metadata, identify formula, required fields, lookback, universe, causality, point-in-time safety → reject non-causal |
| **Causal feature validation** | `declareFeature()` + `FeatureDeclaration` (existing: `src/tree/alpha/feature-declaration.test.ts`) | Reject non-causal, missing fields, negative lookback — compile-time gate |
| **Cost model** | `src/forest/backtest/cost-model.ts` (existing) | NORMAL / CONSERVATIVE / ADVERSE / EXTREME stress modes |
| **Risk model / position sizing** | `src/tree/alpha/portfolio/` + `AlphaExecutionEngine` (existing) | Volatility targeting, exposure limits, correlation, beta, drawdown control |
| **Promotion state machine** | `src/forest/alpha/gate/promotion-states.ts` (existing) | `RESEARCH → BACKTEST → OOS_PASS → ROBUSTNESS_PASS → PAPER → SHADOW → MANUAL_APPROVAL → LIVE` (automated ceiling = SHADOW) |
| **Research registry / evidence store** | `src/forest/alpha/persistence/` + migrations 0009, 0010 (existing) | Append-only, lineage, reproducibility levels |
| **Experiment pipeline** | `src/forest/alpha/pipeline/` (existing) | Deterministic steps, regime detection, walk-forward, evaluation, attribution, baselines |
| **Data provenance** | Extend `ResearchEntry` + `ResearchRegistry` (existing) | Provider, symbol, timeframe, start/end, retrieval timestamp, timezone, adjustment mode, checksum |

---

### WRAP — External capabilities behind explicit adapter boundary

| Vibe-Trading Capability | CashClaw Adapter | Boundary Controls |
|-------------------------|------------------|-------------------|
| **MCP Server** (`agent/mcp_server.py`) | `MCPResearchAdapter` (new: `src/forest/research/adapters/mcp-adapter.ts`) | Allowlist tools, schema validation, timeout, output size limit, audit logging, failure isolation |
| **Data-loader registry** (multi-provider fallback) | `DataProvenanceAdapter` (extend `src/tree/alpha/registry/`) | Record provider per dataset; no silent mixing; version on provider change |
| **Alpha Zoo runtime** (formula execution) | `AlphaZooAdapter` (see REIMPLEMENT) | Never execute arbitrary code; compile to CashClaw experiment spec |
| **Multi-agent swarm** (`agent/src/swarm/`) | `ResearchWorkerAdapter` (new: `src/forest/research/adapters/worker-adapter.ts`) | Input: goal + data + registry + failed experiments; Output: hypotheses + features + experiments + explanations only |
| **Finance skills** (`agent/src/skills/`) | Skill-specific adapters as needed | Same boundary controls as MCP |
| **Report generation** | `ResearchReportAdapter` (new) | Read-only; CashClaw renders its own dashboard |
| **Shadow-account research** | Extend `AlphaExecutionEngine` paper mode | Shadow = paper with live data feed; expectation gap tracking |

---

### REJECT — Violates safety boundary or architectural invariants

| Vibe-Trading Component | Reason for Rejection |
|------------------------|---------------------|
| Arbitrary Python code execution (eval, exec, shell) | No arbitrary code execution in production path |
| LLM-driven order placement | No LLM → ORDER path; human approval required for LIVE |
| Swarm agent bypassing risk engine / cost model / causal validation / promotion gates | Violates absolute safety boundary (§0) |
| Swarm agent modifying historical experiment results | Evidence is append-only immutable |
| Swarm agent modifying promotion thresholds | Gates are code, not config |
| Swarm agent promoting itself | Terminal states (LIVE/KILLED) only reachable via explicit human trigger |
| Unbounded tool execution surface | All external tools must have allowlist, schema, timeout, audit ID, provenance, result hash |
| Uncontrolled network access | External calls only via explicit adapters with timeout |
| Full Vibe-Trading agent runtime embedded in CashClaw Worker | Python runtime incompatible with Cloudflare Workers |
| Vibe-Trading frontend / UI | CashClaw has its own dashboard architecture |
| Direct broker credential management | CashClaw uses NOWPayments + exchange API keys via env vars |
| Arbitrary filesystem access | Sandboxed adapters only |

---

## Conceptual Integration Structure

```
src/
├── tree/
│   ├── research/                    # NEW: Research contracts (Phase 1)
│   │   ├── hypothesis/              # ResearchHypothesis, ExperimentSpec, EvidenceObject
│   │   ├── alpha/
│   │   │   ├── compiler.ts          # AlphaCompiler
│   │   │   ├── zoo-adapter.ts       # AlphaZooAdapter
│   │   │   ├── zoo-metadata.ts      # COPY: alpha metadata schemas
│   │   │   └── provenance.ts        # AlphaProvenance
│   │   ├── goals/
│   │   │   ├── types.ts             # ResearchGoal, ResearchGoalAdapter
│   │   │   └── adapter.ts
│   │   ├── factors/
│   │   │   ├── taxonomy.ts          # COPY: factor taxonomy
│   │   │   ├── ic-ir.ts             # ADAPT: IC/IR calculations
│   │   │   └── ic-ir-types.ts       # COPY: IC/IR type definitions
│   │   ├── swarm/
│   │   │   ├── task-types.ts        # COPY: swarm task schemas
│   │   │   └── worker-adapter.ts    # WRAP: ResearchWorkerAdapter
│   │   ├── evidence/
│   │   │   ├── types.ts             # EvidenceObject, ResearchLineage
│   │   │   └── memory.ts            # ResearchMemory (duplicate detection)
│   │   └── portfolio/
│   │       ├── optimizer-types.ts   # COPY: optimizer concepts
│   │       └── optimizer.ts         # ADAPT: research candidates only
│   ├── alpha/                       # EXISTING: extend, don't duplicate
│   │   ├── hypothesis/              # AlphaHypothesis (extend with new fields)
│   │   ├── factors/                 # Factor engine (add IC/IR)
│   │   ├── portfolio/               # Portfolio optimizer (research mode)
│   │   └── ...
│   └── regime/                      # EXISTING: regime engine
├── forest/
│   ├── research/                    # NEW: Research execution (Phase 4+)
│   │   ├── adapters/
│   │   │   ├── mcp-adapter.ts       # WRAP: MCPResearchAdapter
│   │   │   ├── worker-adapter.ts    # WRAP: ResearchWorkerAdapter
│   │   │   ├── data-provenance.ts   # WRAP: DataProvenanceAdapter
│   │   │   └── report-adapter.ts    # WRAP: ResearchReportAdapter
│   │   ├── jobs/
│   │   │   ├── queue.ts             # Research job queue (persisted)
│   │   │   └── states.ts            # Job lifecycle states
│   │   └── vibe/                    # Vibe-Trading specific adapters
│   ├── alpha/                       # EXISTING: pipeline, gate, evaluation, execution
│   │   ├── pipeline/                # Deterministic experiment pipeline
│   │   ├── gate/                    # Survival gate + promotion state machine
│   │   ├── execution/               # AlphaExecutionEngine (paper/shadow)
│   │   ├── experiments/             # Experiment runner
│   │   ├── persistence/             # D1 adapters for research registry
│   │   └── ...
│   └── backtest/                    # EXISTING: cost model, types, metrics
└── land/
    └── exchange-orchestration/      # EXISTING: exchange orchestration
```

---

## Existing CashClaw Abstractions (DO NOT DUPLICATE)

| Abstraction | Location | Status |
|-------------|----------|--------|
| `AlphaHypothesis` | `src/tree/alpha/hypothesis/types.ts` | **Extend** with provenance, expectedMechanism, costAssumption |
| `FeatureDeclaration` + `declareFeature()` | `src/tree/alpha/indicator-types.ts` | **Use** — causal gate already implemented |
| `RegimeLabel` + `RegimeClassifier` | `src/tree/regime/types.ts`, `classifier.ts` | **Use** — regime conditioning already implemented |
| `BacktestResult` + `RunBacktestOptions` | `src/forest/backtest/types.ts` | **Use** — deterministic backtest with costs |
| `CostConfig` + `applyCosts()` + stress modes | `src/forest/backtest/cost-model.ts` | **Use** — NORMAL/CONSERVATIVE/ADVERSE/EXTREME |
| `StrategyPhase` + `transitionStrategy()` | `src/forest/alpha/gate/promotion-states.ts` | **Use** — promotion state machine enforced |
| `PipelineConfig` + `AlphaResearchReport` | `src/forest/alpha/pipeline/types.ts` | **Use** — deterministic pipeline |
| `AlphaExecutionEngine` (paper) | `src/forest/alpha/execution/engine.ts` | **Use** — paper trading with risk controls |
| `ResearchRegistry` + `ResearchEntry` | `src/tree/alpha/registry/types.ts` + migrations 0009/0010 | **Use** — append-only evidence store |
| `Experiment` + `runExperiment()` | `src/forest/alpha/experiments/runner.ts` | **Use** — train/validate/test + walk-forward |
| `TelemetryWriter` | `src/tree/telemetry/writer.ts` | **Use** — async D1 persistence |

---

## Vibe-Trading Components Not Yet Inspected (from spec)

The following Vibe-Trading paths were referenced in the 32-point spec but not directly inspected. Classification is provisional based on spec description:

| Path | Provisional Classification | Notes |
|------|---------------------------|-------|
| `agent/src/agent` | WRAP / REJECT | Agent runtime — wrap research capabilities, reject execution |
| `agent/src/factors` | ADAPT | Factor research → CashClaw factor engine |
| `agent/src/skills` | WRAP | Finance skills behind adapter |
| `agent/src/swarm` | WRAP | Swarm → `ResearchWorkerAdapter` |
| `agent/src/providers` | WRAP | Data providers → `DataProvenanceAdapter` |
| `agent/backtest` | REIMPLEMENT | Already have CashClaw backtest |
| `agent/mcp_server.py` | WRAP | MCP → `MCPResearchAdapter` |

**Action:** Complete direct inspection of these paths to finalize classifications.

---

## Next Steps

1. **Complete Vibe-Trading direct inspection** of the 7 paths above
2. **Create `docs/vibe-trading-security-boundary.md`** (parallel deliverable)
3. **Run all existing tests** — `npm test` (quality gate)
4. **Begin Phase 1** — Implement Research Contracts:
   - `ResearchHypothesis` (extend `AlphaHypothesis`)
   - `ResearchGoal`
   - `EvidenceObject`
   - `ExperimentSpec`
   - `AlphaProvenance`
   - `ResearchLineage`
   - Add tests

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-26 | Principal Quant Architect | Initial integration map from Phase 0 recon |