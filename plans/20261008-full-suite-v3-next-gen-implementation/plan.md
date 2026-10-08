---
name: full-suite-v3-next-gen-implementation
status: pending
created: 2026-10-08
type: implementation-plan
---

# Full-Suite v3 Next-Gen Quantitative OS Plan

## Overview
Kế hoạch triển khai toàn diện bộ giải pháp định lượng cấp tổ chức v3 (Full-Suite v3 Next-Gen) cho Trade-Bot:
1. **Pillar 1:** Smart Order Routing (SOR), TWAP / VWAP Slicing & Microstructure Urgency Guard.
2. **Pillar 2:** Institutional L2 Cockpit UI & Real-Time Gauges (Depth Ladder, Toxicity Gauge, Fleet Radar Card).
3. **Pillar 3:** Black Swan Stress Simulator, Copula Tail-Dependence & CVaR (Expected Shortfall 99%).
4. **Pillar 4:** End-to-End Cross-Stack Integration & Quality Gates.

## Phases & Execution Strategy

| Phase | Description | Status | Target File |
|---|---|---|---|
| [Phase 01](./phase-01-smart-order-routing-twap-vwap.md) | Smart Order Routing (SOR), TWAP/VWAP Slicing & Microstructure Urgency Guard | Pending | `phase-01-smart-order-routing-twap-vwap.md` |
| [Phase 02](./phase-02-institutional-cockpit-ui.md) | Institutional L2 Cockpit UI & Real-Time Gauges | Pending | `phase-02-institutional-cockpit-ui.md` |
| [Phase 03](./phase-03-black-swan-copula-cvar.md) | Black Swan Stress Simulator & Copula CVaR Engine | Pending | `phase-03-black-swan-copula-cvar.md` |
| [Phase 04](./phase-04-v3-cross-stack-integration.md) | End-to-End Cross-Stack Integration & Global Verification | Pending | `phase-04-v3-cross-stack-integration.md` |

## Key Invariants & Dependencies
- **ADR-001:** Paper-only v1, mô phỏng khớp lệnh thực tế qua L2 Microstructure Simulator.
- **Edge Native:** WebCrypto `crypto.subtle`, 0 Node.js-specific modules, 0 external math libraries.
- **LOC Invariant:** <= 200 lines per file (target <= 100 LOC), 0 `:any`, 0 ESLint warnings.
- **Coverage:** 100% test coverage trên các engine định lượng, 90%+ global coverage floor.
