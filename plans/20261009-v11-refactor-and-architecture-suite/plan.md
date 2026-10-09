---
title: "Unified v11 Architecture Suite & Comprehensive Refactoring"
description: "Parallel execution plan for Unified Execution OMS/EMS, Vectorized Alpha Research Engine, and v11 Quant Desks"
status: pending
priority: P1
effort: 5h
branch: main
tags: [trading, quant, v11, refactor, execution-oms, vectorized-factor, kalman, impact, hedging]
created: 2026-10-09
---

# Unified v11 Architecture Suite & Comprehensive Refactoring Master Plan

Kế hoạch triển khai đồng bộ 3 trụ cột tái cấu trúc và mở rộng kiến trúc định lượng cho CashClaw.

## Dependency Graph & Execution Strategy
```
┌─────────────────────────────────┐
│ Phase 1: Unified Execution OMS  │ ──┐
└─────────────────────────────────┘   │
┌─────────────────────────────────┐   ├─► ┌─────────────────────────────────┐
│ Phase 2: Vectorized Factor Lab  │ ──┤   │ Phase 4: Full E2E Simulation    │
└─────────────────────────────────┘   │   └─────────────────────────────────┘
┌─────────────────────────────────┐   │
│ Phase 3: v11 Quantitative Desks │ ──┘
└─────────────────────────────────┘
```
Phases 1, 2, và 3 hoàn toàn độc lập về mặt module và có thể triển khai song song. Phase 4 thực hiện tích hợp liên hoàn và kiểm thử hồi quy toàn diện.

## Phases

### Phase 1: Unified Execution OMS/EMS Waterfall Pipeline
- Status: pending
- File: [phase-01-unified-execution-oms-waterfall.md](./phase-01-unified-execution-oms-waterfall.md)
- Target: `src/tree/execution/oms/execution-oms-types.ts`, `execution-oms-waterfall.ts`, và test suite.
- Priority: High | Effort: 1.5h

### Phase 2: Alpha Lab Consolidation & Vectorized Research Engine
- Status: pending
- File: [phase-02-alpha-lab-vectorized-engine.md](./phase-02-alpha-lab-vectorized-engine.md)
- Target: `src/tree/research/vectorized/vectorized-factor-types.ts`, `vectorized-factor-engine.ts`, và test suite.
- Priority: High | Effort: 1.5h

### Phase 3: v11 Quantitative & Algorithmic Desk Expansion
- Status: pending
- File: [phase-03-v11-quantitative-desks.md](./phase-03-v11-quantitative-desks.md)
- Target: `src/tree/quantlib/kalman/`, `src/tree/quantlib/impact/`, `src/tree/quantlib/hedging/`, và test suites.
- Priority: High | Effort: 1.5h

### Phase 4: Full-Suite Integration Simulation & Quality Gate
- Status: pending
- File: [phase-04-full-suite-integration-simulation.md](./phase-04-full-suite-integration-simulation.md)
- Target: `test/quant/v11-full-suite-simulation.test.ts`, roadmap, changelog, và memory index.
- Priority: High | Effort: 0.5h

## Quality & Safety Constraints
- Safety: Tuyệt đối tuân thủ ADR-001 (Paper/Backtest only, zero live trading surface).
- Code Standards: File $\le 130$ LOC (tối đa 200 LOC), 0 `:any`, 0 `console.log`.
- Test Coverage: 100% test coverage trên toàn bộ các engine toán học và định lượng mới.
