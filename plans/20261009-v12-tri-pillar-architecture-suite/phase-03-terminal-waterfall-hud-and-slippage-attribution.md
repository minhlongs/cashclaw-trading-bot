# Phase 03: Terminal Waterfall HUD & Slippage Attribution

## Mục tiêu
Cung cấp khả năng giám sát trực quan cho người vận hành qua Terminal Waterfall HUD widget và bộ phân rã chi phí trượt giá thực nghiệm sau giao dịch (Post-Trade Slippage Attribution Ledger).

## Files tạo mới / cập nhật
1. `src/tree/execution/attribution/slippage-attribution-types.ts` (<= 40 LOC)
   - Types cho ArrivalExecution, SlippageDecomposition, AttributionSummary.
2. `src/tree/execution/attribution/slippage-attribution-ledger.ts` (<= 110 LOC)
   - Hàm giải tích phân rã: Total Cost = Half Spread + Transient Impact + Permanent Drift.
3. `src/components/dashboard/terminal-waterfall-hud.tsx` (<= 140 LOC)
   - Component Next.js hiển thị trạng thái 4 tầng Waterfall, Dark Mesh netting ratio, và thanh đo Greeks Risk meters.
4. `test/quant/slippage-attribution-ledger.test.ts` (<= 100 LOC)
   - Unit tests kiểm tra tính chính xác của phân rã chi phí trượt giá.

## Tiêu chí thành công
- File <= 160 LOC, 0 `:any`.
- 100% semantic CSS tokens, bilingual keys.
