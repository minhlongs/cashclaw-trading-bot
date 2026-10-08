---
name: v6-institutional-apex-implementation
status: completed
created: 2026-10-08
type: implementation-plan
---

# Full Institutional Apex OS (v6 Quantitative Architecture) Implementation Plan

## Overview
Kế hoạch triển khai toàn diện bộ giải pháp định lượng cấp tổ chức v6 (Full Institutional Apex OS) cho Trade-Bot:
1. **Pillar 1:** Smart Limit Router & Passive Fill Optimizer (Micro-Price Imbalance, Poisson Queue Priority, Cancel-on-Toxicity Guard).
2. **Pillar 2:** Microstructure Flow Toxicity & Hawkes Process Desk (Continuous VPIN Streaming, Self-Exciting Hawkes Burst Clustering, Whale Sweep Signals).
3. **Pillar 3:** Multi-Asset Hierarchical Risk Parity (HRP) & Copula Tail-Risk Desk (Single-Linkage Dendrogram, Quasi-Diagonalization, Recursive Bisection Inverse-Variance Allocation, Clayton Copula CVaR).
4. **Pillar 4:** Cross-Stack E2E Verification & Institutional Quality Gates.

## Phases & Execution Strategy

| Phase | Description | Status | Target File |
|---|---|---|---|
| [Phase 01](./phase-01-smart-limit-router-desk.md) | Smart Limit Router & Passive Fill Optimizer Desk | Completed | `phase-01-smart-limit-router-desk.md` |
| [Phase 02](./phase-02-flow-toxicity-hawkes-desk.md) | Microstructure Flow Toxicity & Hawkes Point Process Desk | Completed | `phase-02-flow-toxicity-hawkes-desk.md` |
| [Phase 03](./phase-03-hierarchical-risk-parity-desk.md) | Hierarchical Risk Parity (HRP) & Copula Tail-Risk Desk | Completed | `phase-03-hierarchical-risk-parity-desk.md` |
| [Phase 04](./phase-04-cross-stack-verification-and-gates.md) | Cross-Stack Integration Test, Quality Gates & Production Build | Completed | `phase-04-cross-stack-verification-and-gates.md` |

## Key Invariants & Dependencies
- **ADR-001:** Paper-only v1, mô phỏng khớp lệnh thực tế, 0 real capital, 0 live exchange order surface.
- **Edge Native:** Pure deterministic TypeScript, WebCrypto native, 0 external C/C++ dependencies.
- **LOC Invariant:** <= 200 lines per file (target <= 130 LOC), 0 `:any`, 0 ESLint warnings.
- **Coverage:** 100% test coverage trên các math & quant engine mới, toàn bộ test suite hiện có (>5,329 tests) xanh 100%.
