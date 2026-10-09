# Phase 1: Unified Execution OMS/EMS Waterfall Pipeline

## Context Links
- Plan: [plan.md](./plan.md)
- Specs: [docs/brainstorming-v11-refactor-architecture.md](../../docs/brainstorming-v11-refactor-architecture.md)
- Existing Modules: `src/tree/execution/darkmesh/rfq-darkmesh-router.ts`, `src/tree/execution/smart/sor-router.ts`, `src/tree/execution/smart/microstructure-urgency-guard.ts`

## Overview
- Priority: High
- Status: pending
- Target: `src/tree/execution/oms/execution-oms-types.ts`, `src/tree/execution/oms/execution-oms-waterfall.ts`, `src/tree/execution/oms/index.ts`, và `src/tree/execution/oms/execution-oms-waterfall.test.ts`

## Requirements
- Định nghĩa trạng thái đơn hàng `ExecutionOrderState` (`SUBMITTED`, `CROSSING`, `SLICING`, `ROUTING`, `FILLED`, `REJECTED`).
- Kết nối thác thực thi (Waterfall):
  1. Internal RFQ Dark Mesh matching trước tại mid-price để tiết kiệm phí taker.
  2. Microstructure Urgency Guard: Kiểm tra VPIN và Order Flow Imbalance để chặn/giảm tốc khi dòng lệnh thị trường bất lợi.
  3. Algorithmic Slicing: Chia nhỏ khối lượng dư theo lịch trình TWAP/VWAP.
  4. SOR Routing: Định tuyến các mẩu lệnh ra các địa điểm thanh khoản tối ưu.

## Related Code Files
- Tạo mới: `src/tree/execution/oms/execution-oms-types.ts` ($\le 70$ LOC)
- Tạo mới: `src/tree/execution/oms/execution-oms-waterfall.ts` ($\le 120$ LOC)
- Tạo mới: `src/tree/execution/oms/index.ts` ($\le 10$ LOC)
- Tạo mới: `src/tree/execution/oms/execution-oms-waterfall.test.ts` ($\le 130$ LOC)

## Success Criteria
- 100% test coverage trên `execution-oms-waterfall.ts`.
- Bảo toàn nguyên vẹn 100% khối lượng giao dịch qua toàn bộ các bước waterfall.
- 0 `:any`, 0 `console.log`.
