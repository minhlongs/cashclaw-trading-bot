# Phase 02: L2 Microstructure Realistic Paper Execution Simulator

## Context Links
- Report: `plans/reports/brainstorm-deep-3-pillars-report.md`
- Paper Exchange: `src/tree/exchange/provider/paper-provider.ts`
- Microstructure Features: `src/tree/alpha/microstructure/feature-computer.ts`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Nâng cấp Paper Trading engine với cơ chế mô phỏng hàng đợi Limit Order (Queue Priority) và trượt giá tức thời (Market Impact Slippage) theo Almgren-Chriss / Kyle's Lambda.

## Architecture & Data Flow
1. Tiếp nhận Depth Level 20 và dòng `aggTrades`.
2. Theo dõi vị trí hàng đợi khi đặt Limit Order ở Best Bid / Best Ask.
3. Khi market order được kích hoạt, tính toán trượt giá dựa trên độ sâu sổ lệnh và hằng số tác động giá.
4. Cập nhật `PaperExchange` tính toán fill price chân thực.

## Related Code Files
- `src/tree/exchange/simulator/l2-types.ts` (Create)
- `src/tree/exchange/simulator/queue-tracker.ts` (Create)
- `src/tree/exchange/simulator/slippage-model.ts` (Create)
- `src/tree/exchange/simulator/queue-tracker.test.ts` (Create)
- `src/tree/exchange/simulator/slippage-model.test.ts` (Create)

## Success Criteria
- Đạt 100% test coverage trên các tính toán vi cấu trúc thị trường.
- Bảo toàn trọn vẹn ADR-001 (paper mode only).
- File <= 200 LOC, 0 `:any`.
