# Phase 01: Runtime Execution Wiring & Fleet Risk Interceptor

## Overview
- Priority: High
- Status: Pending
- Objective: Kết nối SOR, TWAP Slicing và Fleet Circuit Breaker vào luồng xử lý thực tế của `ExchangeOrchestrator` và `BotManager`.

## Architecture & Responsibilities
- `src/tree/execution/runtime/sor-execution-coordinator.ts`: Nhận lệnh cha, áp dụng TWAP slice và SOR allocation qua các sàn ảo.
- `src/tree/execution/runtime/fleet-risk-interceptor.ts`: Đánh giá trạng thái drawdown danh mục trước khi cho phép bot đặt lệnh.

## Implementation Steps
1. Định nghĩa contracts cho runtime coordinator và fleet interceptor.
2. Viết unit tests kiểm thử 100% các nhánh: pass qua khi an toàn, throttle/pause khi rủi ro cao.
3. Tích hợp nhẹ nhàng vào vòng lặp khớp lệnh paper.

## Success Criteria
- Files <= 120 LOC, 0 `:any`.
- 100% test coverage trên module mới.
