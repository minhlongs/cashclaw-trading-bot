---
name: v5-tri-horizon-synthesis-implementation
status: completed
created: 2026-10-08
type: implementation-plan
---

# Full Tri-Horizon Synthesis (v5 Quantitative OS) Implementation Plan

## Overview
Kế hoạch triển khai toàn diện bộ giải pháp định lượng cấp tổ chức v5 (Full Tri-Horizon Synthesis) cho Trade-Bot:
1. **Pillar 1:** Graph-Theoretic Triangular Arbitrage Engine (Bellman-Ford Negative Cycle, Log-Exchange Rates, 3-Leg Fee/Slippage Accounting).
2. **Pillar 2:** Adaptive Regime & Bayesian Multi-Armed Bandit Strategy Allocator (Markov Volatility Regime, Thompson Sampling Beta Prior, Dynamic Capital Weights).
3. **Pillar 3:** Synthetic Greeks & Delta-Neutral Hedging Desk (Closed-form Black-76 Greeks $\Delta, \Gamma, \Theta, \mathcal{V}$, Portfolio Delta Drift Guard, Auto-Hedger Action Generator).
4. **Pillar 4:** Cross-Stack E2E Verification & Quantitative Quality Gates.

## Phases & Execution Strategy

| Phase | Description | Status | Target File |
|---|---|---|---|
| [Phase 01](./phase-01-triangular-arbitrage-engine.md) | Graph-Theoretic Triangular Arbitrage & Negative Cycle Engine | Completed | `phase-01-triangular-arbitrage-engine.md` |
| [Phase 02](./phase-02-adaptive-regime-mab-allocator.md) | Adaptive Regime Classification & Bayesian MAB Strategy Allocator | Completed | `phase-02-adaptive-regime-mab-allocator.md` |
| [Phase 03](./phase-03-synthetic-greeks-hedging-desk.md) | Synthetic Greeks Analytics & Delta-Neutral Portfolio Hedger | Completed | `phase-03-synthetic-greeks-hedging-desk.md` |
| [Phase 04](./phase-04-cross-stack-verification-and-gates.md) | Cross-Stack Integration Test, Quality Gates & Production Build | Completed | `phase-04-cross-stack-verification-and-gates.md` |

## Key Invariants & Dependencies
- **ADR-001:** Paper-only v1, mô phỏng khớp lệnh thực tế, 0 real capital, 0 live exchange order surface.
- **Edge Native:** WebCrypto, pure deterministic TypeScript, không phụ thuộc C/C++ native addons hay Node.js-only APIs.
- **LOC Invariant:** <= 200 lines per file (target <= 140 LOC), 0 `:any`, 0 ESLint warnings.
- **Coverage:** 100% test coverage trên các math & quant engine mới, toàn bộ test suite xanh 100%.
