# Phase 01: Smart Limit Router & Passive Fill Optimizer Desk

## Context & Objectives
Triển khai bộ định tuyến lệnh giới hạn thông minh (SLR) tại `src/tree/execution/slr/` nhằm tối ưu hóa việc ăn Maker Rebate và giảm thiểu trượt giá Taker:
1. `slr-types.ts`: Định nghĩa các kiểu dữ liệu cho MicroPrice, LOB Imbalance, Queue Placement và Cancel-on-Toxicity directive.
2. `micro-price-estimator.ts`: Tính toán giá vi mô dựa trên Order Book Imbalance (OBI).
3. `queue-priority-tracker.ts`: Mô hình hóa vị trí xếp hàng Poisson và xác suất khớp lệnh Maker.
4. `passive-execution-router.ts`: Tạo lệnh limit thụ động kèm bộ đệm an toàn tự động hủy lệnh khi giá vi mô đảo chiều bất lợi.
5. Unit test suite `slr.test.ts` đạt 100% test coverage.

## Todo List
- [ ] Tạo `src/tree/execution/slr/slr-types.ts` (<= 100 LOC)
- [ ] Tạo `src/tree/execution/slr/micro-price-estimator.ts` (<= 110 LOC)
- [ ] Tạo `src/tree/execution/slr/queue-priority-tracker.ts` (<= 120 LOC)
- [ ] Tạo `src/tree/execution/slr/passive-execution-router.ts` (<= 130 LOC)
- [ ] Tạo `src/tree/execution/slr/slr.test.ts` (<= 140 LOC)
- [ ] Chạy vitest xác minh 100% test pass.
