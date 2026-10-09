# Plan: v14 Apex Multi-Domain Quantitative & Architecture Suite

## Overview
Status: in_progress
Estimated Phases: 4
Architecture Invariant: ADR-001 paper-only invariant preserved, 0 `:any` types, all files <= 140 LOC.

---

## Phases & Breakdown

### Phase 1: Gatheral-Schied Transient Market Impact & Alfonsi LOB Depth Resilience
- **Files**:
  - `src/tree/quantlib/microstructure/gatheral-transient-impact-types.ts`
  - `src/tree/quantlib/microstructure/gatheral-transient-impact.ts`
  - `src/tree/quantlib/microstructure/alfonsi-lob-resilience.ts`
  - `test/quant/gatheral-transient-impact.test.ts`
  - `test/quant/alfonsi-lob-resilience.test.ts`
- **Status**: pending

### Phase 2: Hawkes Self-Exciting Jump Toxicity & Ledoit-Wolf Shrinkage Covariance
- **Files**:
  - `src/tree/quantlib/microstructure/hawkes-jump-toxicity.ts`
  - `src/tree/quantlib/microstructure/hawkes-jump-types.ts`
  - `src/tree/quantlib/portfolio/ledoit-wolf-shrinkage.ts`
  - `test/quant/hawkes-jump-toxicity.test.ts`
  - `test/quant/ledoit-wolf-shrinkage.test.ts`
- **Status**: pending

### Phase 3: Structural Modularization of Top 3 Monoliths (> 175 LOC)
- **Files**:
  - `src/forest/alpha/gate/robustness-checks.ts` & `robustness-checks-invariance.ts`
  - `src/forest/alpha/research-agent/agent.ts` & `agent-validation-matcher.ts`
  - `src/forest/alpha/observability-eval/telemetry-diagnostics.ts` & `telemetry-diagnostics-metrics.ts`
- **Status**: pending

### Phase 4: Full Suite Integration, End-to-End Test & Quality Gate
- **Files**:
  - `test/quant/v14-apex-suite-simulation.test.ts`
  - Verification: 100% tests green, `npx tsc --noEmit` clean, `npm run build` clean.
- **Status**: pending
