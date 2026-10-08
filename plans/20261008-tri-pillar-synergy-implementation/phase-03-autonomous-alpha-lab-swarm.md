# Phase 03: Autonomous Alpha Lab Swarm & DSR Overfitting Defense

## Context Links
- Report: `plans/reports/brainstorm-deep-3-pillars-report.md`
- Deliberation Bridge: `src/forest/research/tradingagents/deliberation-pipeline-bridge.ts`
- Survival Gate: `src/forest/alpha/gate/survival-gate.ts`
- Promotion Machine: `src/forest/alpha/gate/promotion-states.ts`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Tự động hóa hoàn toàn quy trình nghiên cứu multi-agent: phát hiện bất thường thị trường -> kích hoạt debate -> compile giả thuyết -> backtest kiểm định -> tính Deflated Sharpe Ratio -> Survival Gate -> Promotion state.

## Architecture & Data Flow
1. Scheduler định kỳ quét dữ liệu thị trường và kích hoạt `runAutonomousSwarm()`.
2. Trích xuất bất thường (Funding extreme, Open Interest jump).
3. Chạy Multi-agent Deliberation qua `ModelRouter` với Offline / Fixture fallback an toàn.
4. Kiểm định chiến lược qua `AlphaResearchPipeline` và `runSurvivalGate`.
5. Tính toán Deflated Sharpe Ratio (DSR) phạt số lần thử nghiệm lũy kế ($N$).

## Related Code Files
- `src/forest/research/swarm/swarm-types.ts` (Create)
- `src/forest/research/swarm/deflated-sharpe.ts` (Create)
- `src/forest/research/swarm/autonomous-swarm.ts` (Create)
- `src/forest/research/swarm/deflated-sharpe.test.ts` (Create)
- `src/forest/research/swarm/autonomous-swarm.test.ts` (Create)

## Success Criteria
- Fail-closed khi dữ liệu chất lượng kém hoặc Sharpe bị trừng phạt do over-testing.
- Cố định trần tự động `AUTOMATED_CEILING = 'SHADOW' as const`.
- File <= 200 LOC, 0 `:any`.
