# Phase 02: Closed-Loop Reflexive Alpha Deliberation

## Overview
- **Priority**: High
- **Status**: Pending
- **Goal**: Xây dựng cơ chế khép kín vòng phản hồi từ `VectorizedFactorEngine` và `SurvivalGate` ngược lại `TradingAgents` debate rounds.

## System Architecture
- Nhận `FactorPerformanceMetrics` (IC, IR, t-stat, Quantile Spread) và `GateVerdict` (`PAPER_CANDIDATE` / `KILLED`).
- Cập nhật ma trận `AgentBeliefPrior`:
  - Thưởng trọng số tự tin (+confidence boost) nếu factor sống sót qua out-of-sample validation.
  - Phạt hạ thấp trọng số (-penalty) và gắn cờ cấm (quarantine blacklist) đối với các tham số/giả thuyết vi phạm kinh tế hoặc overfitting.
- Sinh ra prompt context bổ sung cho các LLM agents trong debate round tiếp theo.

## Related Code Files
- `src/forest/research/tradingagents/deliberation-reflexive-types.ts` (Tạo mới, $\le 70$ LOC)
- `src/forest/research/tradingagents/deliberation-reflexive-loop.ts` (Tạo mới, $\le 130$ LOC)
- `test/quant/deliberation-reflexive-loop.test.ts` (Tạo mới)

## Success Criteria
- Đảm bảo tính tất định (deterministic), không side-effects, test coverage 100%.
- Không gọi network I/O, tuân thủ kiến trúc pure function.
