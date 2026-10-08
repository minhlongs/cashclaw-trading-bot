---
name: full-suite-advanced-quant-implementation
status: completed
created: 2026-10-08
type: implementation-plan
---

# Full-Suite Advanced Quantitative Evolution Plan

## Overview
Kế hoạch triển khai toàn diện bộ giải pháp định lượng tổ chức (Institutional-Grade Quant Suite) cho Trade-Bot:
1. Cross-Venue Delta-Neutral Automated Hedger & Inventory Rebalancer.
2. L2 Order Flow Imbalance (OFI), VPIN & Microstructure Toxicity Alpha.
3. Multi-Bot Fleet Risk Commander & Dynamic Capital Allocation (HRP / Fractional Kelly).
4. Full Cross-Stack Integration & Quality Gates.

## Phases & Execution Strategy

| Phase | Description | Status | Target File |
|---|---|---|---|
| [Phase 01](./phase-01-cross-venue-delta-hedger.md) | Cross-Venue Delta-Neutral Automated Hedger & Inventory Rebalancer | Complete | `phase-01-cross-venue-delta-hedger.md` |
| [Phase 02](./phase-02-l2-ofi-toxicity-alpha.md) | L2 Order Flow Imbalance (OFI) & VPIN Toxicity Alpha | Complete | `phase-02-l2-ofi-toxicity-alpha.md` |
| [Phase 03](./phase-03-fleet-risk-commander-hrp.md) | Fleet Risk Commander & Dynamic Capital Allocation (HRP / Kelly) | Complete | `phase-03-fleet-risk-commander-hrp.md` |
| [Phase 04](./phase-04-full-suite-integration.md) | End-to-End Cross-Stack Integration & Quality Gates | Complete | `phase-04-full-suite-integration.md` |

## Key Invariants & Dependencies
- **ADR-001:** Paper-only v1, mô phỏng khớp lệnh thực tế qua L2 Microstructure Simulator.
- **Edge Native:** WebCrypto `crypto.subtle`, 0 Node.js-specific modules, 0 external math libraries.
- **LOC Invariant:** <= 200 lines per file (target <= 100 LOC), 0 `:any`, 0 ESLint warnings.
- **Coverage:** 100% test coverage trên các engine định lượng, 90%+ global coverage floor.
