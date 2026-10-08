# Phase 03: Fleet Risk Commander & Dynamic Capital Allocation (HRP / Kelly)

## Context Links
- Report: `plans/reports/20261008-full-suite-advanced-quant-evolution-report.md`
- Portfolio Optimizer: `src/tree/alpha/portfolio/optimizer.ts`
- Survival Gate: `src/forest/alpha/gate/survival-gate.ts`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Thiết kế bộ chỉ huy rủi ro hạm đội bot (Fleet Risk Commander) tự động phân bổ vốn đa chiến lược bằng Hierarchical Risk Parity (HRP) và Fractional Kelly, tích hợp Circuit Breaker toàn danh mục.

## Architecture & Data Flow
1. Thu thập chuỗi lợi nhuận lịch sử của tất cả các bot đang chạy (Grid, Mean Reversion, Vol-DCA, Funding Arb).
2. `hrp-allocator.ts`: Xây dựng cây phân cấp tương quan (quasi-diagonalization) và phân bổ trọng số rủi ro nghịch đảo biến động từng cụm.
3. `fractional-kelly.ts`: Tính toán tỷ lệ cược tối ưu có chặn an toàn $\le 0.5 \times f^*$.
4. `fleet-circuit-breaker.ts`: Giám sát Max Drawdown toàn hệ thống và đột biến tương quan rủi ro, tự động chuyển bot sang trạng thái orderly pause.

## Related Code Files
- `src/forest/risk/commander/fleet-types.ts` (Create)
- `src/forest/risk/commander/hrp-allocator.ts` (Create)
- `src/forest/risk/commander/fractional-kelly.ts` (Create)
- `src/forest/risk/commander/fleet-circuit-breaker.ts` (Create)
- `src/forest/risk/commander/hrp-allocator.test.ts` (Create)
- `src/forest/risk/commander/fractional-kelly.test.ts` (Create)
- `src/forest/risk/commander/fleet-circuit-breaker.test.ts` (Create)

## Success Criteria
- 100% test coverage trên `src/forest/risk/commander/`.
- File <= 200 LOC, 0 `:any`, 0 ESLint warnings.
- `AUTOMATED_CEILING = 'SHADOW'` invariant được bảo toàn tuyệt đối.
