# Phase 03: Fat-Files Modularization & LOC Optimization

## Overview
- **Priority**: High
- **Status**: Pending
- **Goal**: Refactor các file mã nguồn tiệm cận ngưỡng trần 200 LOC (>170 LOC) về $\le 140$ LOC mà không phá vỡ bất kỳ test hiện hữu nào.

## Targeted Files
1. `src/tree/execution/oms/execution-oms-waterfall.ts` (176 LOC)
   - Tách logic định tuyến từng stage sang `src/tree/execution/oms/execution-oms-stages.ts`.
2. `src/tree/alpha/observability/attribution.ts` (198 LOC)
   - Tách metrics helper sang `src/tree/alpha/observability/attribution-metrics.ts`.
3. `src/tree/alpha/data-quality/validate-alignment.ts` (192 LOC)
   - Tách logic kiểm tra timestamp sequence sang `src/tree/alpha/data-quality/validate-alignment-helpers.ts`.

## Success Criteria
- Tất cả các file đích đều $\le 140$ LOC.
- 100% các bài test hiện tại tiếp tục pass không sửa đổi test code.
- Zero `:any`, zero lint warning.
