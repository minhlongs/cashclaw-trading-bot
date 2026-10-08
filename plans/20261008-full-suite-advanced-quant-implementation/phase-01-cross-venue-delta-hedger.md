# Phase 01: Cross-Venue Delta-Neutral Automated Hedger & Inventory Rebalancer

## Context Links
- Report: `plans/reports/20261008-full-suite-advanced-quant-evolution-report.md`
- Basis Calculator: `src/tree/exchange/arbitrage/basis-calculator.ts`
- Funding Types: `src/tree/exchange/arbitrage/funding-types.ts`
- L2 Simulator: `src/tree/exchange/simulator/`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Xây dựng module tự động theo dõi rủi ro delta giữa hai chân giao dịch (Spot vs Perp hoặc Perp A vs Perp B), phát hiện lệch tồn kho (delta drift) và tự động sinh lệnh tái cân bằng (rebalance order) kèm lá chắn ký quỹ (margin/liquidation guard).

## Architecture & Data Flow
1. Tiếp nhận vị thế 2 chân từ Paper Exchange / Simulated Portfolio.
2. `delta-exposure-tracker.ts`: Tính toán ròng $\Delta_{\text{net}} = Q_A \cdot S_A - Q_B \cdot S_B$ và tỷ lệ độ lệch delta $\delta_{\text{ratio}}$.
3. `inventory-rebalancer.ts`: Phát sinh lệnh tái cân bằng khi $|\Delta_{\text{net}}| > \tau_{\text{threshold}}$, khớp qua L2 simulator.
4. `margin-liquidation-guard.ts`: Giám sát đòn bẩy, hệ số an toàn ký quỹ (Margin Safety Ratio), và cảnh báo thanh lý.

## Related Code Files
- `src/tree/exchange/arbitrage/hedger/hedger-types.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/delta-exposure-tracker.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/inventory-rebalancer.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/margin-liquidation-guard.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/delta-exposure-tracker.test.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/inventory-rebalancer.test.ts` (Create)
- `src/tree/exchange/arbitrage/hedger/margin-liquidation-guard.test.ts` (Create)

## Success Criteria
- 100% test coverage trên các file thuộc `src/tree/exchange/arbitrage/hedger/`.
- File <= 200 LOC, 0 `:any`, 0 ESLint warnings.
- ADR-001 paper-only: không phát sinh lệnh thật ra ngoài sàn.
