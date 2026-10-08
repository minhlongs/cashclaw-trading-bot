---
name: v4-full-deep-quant-implementation
status: completed
created: 2026-10-08
type: implementation-plan
---

# Full-Deep v4 Quantitative OS & Statistical Arbitrage Plan

## Overview
Kế hoạch triển khai toàn diện bộ giải pháp định lượng chuyên sâu v4 (Full-Deep Synergy) cho Trade-Bot:
1. **Pillar 1:** Runtime Engine & Execution Orchestration Wiring (SOR, TWAP, Fleet Risk Guard in Bot Loop).
2. **Pillar 2:** High-Performance Statistical Arbitrage & Kalman Filter Pairs Desk (Recursive $\beta_t$, OU Half-Life, Cointegration).
3. **Pillar 3:** Dashboard Cockpit Live Telemetry & Interactive Terminal HUD (L2 Depth Ladder, OFI/VPIN Gauges, i18n).
4. **Pillar 4:** End-to-End Cross-Stack Verification & Quantitative Quality Gates.

## Phases & Execution Strategy

| Phase | Description | Status | Target File |
|---|---|---|---|
| [Phase 01](./phase-01-runtime-execution-wiring.md) | Runtime Execution Wiring: SOR, TWAP, & Fleet Risk Interceptor | Completed | `phase-01-runtime-execution-wiring.md` |
| [Phase 02](./phase-02-kalman-statarb-desk.md) | High-Performance Stat-Arb Desk: Kalman Filter & OU Cointegration | Completed | `phase-02-kalman-statarb-desk.md` |
| [Phase 03](./phase-03-cockpit-hud-live-integration.md) | Dashboard Cockpit HUD: Live Telemetry, Gauges & Bilingual i18n | Completed | `phase-03-cockpit-hud-live-integration.md` |
| [Phase 04](./phase-04-cross-stack-verification-and-gates.md) | Cross-Stack Integration Test & Global Quality Gates | Completed | `phase-04-cross-stack-verification-and-gates.md` |

## Key Invariants & Dependencies
- **ADR-001:** Paper-only v1, mô phỏng khớp lệnh thực tế, 0 real capital.
- **Edge Native:** WebCrypto, không sử dụng thư viện toán ngoài hoặc Node.js-only API.
- **LOC Invariant:** <= 200 lines per file (target <= 100 LOC), 0 `:any`, 0 ESLint warnings.
- **Coverage:** 100% test coverage trên các math engine mới, toàn bộ test suite xanh 100%.
