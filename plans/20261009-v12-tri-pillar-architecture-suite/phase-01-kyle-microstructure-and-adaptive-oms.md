# Phase 01: Kyle Microstructure & Adaptive OMS Execution

## Mục tiêu
Nâng cấp tầng thực thi vi cấu trúc với mô hình đo lường lựa chọn đối nghịch Kyle-Back ($\lambda$) và thuật toán cắt lệnh thích ứng theo đường cong khối lượng trong ngày (Intraday U-Curve Volume Distribution).

## Files tạo mới / cập nhật
1. `src/tree/quantlib/microstructure/kyle-adverse-selection-types.ts` (<= 50 LOC)
   - Interfaces cho OrderFlowTrade, KyleLambdaResult, AdverseSelectionConfig.
2. `src/tree/quantlib/microstructure/kyle-adverse-selection-engine.ts` (<= 140 LOC)
   - Thuật toán hồi quy OLS $\Delta P = \lambda \cdot Q + \varepsilon$ ước lượng $\lambda$ và phân tách signed flow.
3. `src/tree/execution/oms/adaptive-volume-slicer.ts` (<= 120 LOC)
   - Phân chia slice theo tỷ trọng đường cong khối lượng U-shape thay vì TWAP đồng đều.
4. `test/quant/kyle-adverse-selection.test.ts` (<= 140 LOC)
   - Unit tests kiểm tra tính chính xác của $\lambda$ và adaptive slicing.

## Tiêu chí thành công
- File <= 160 LOC, 0 `:any`.
- Unit tests pass 100%.
