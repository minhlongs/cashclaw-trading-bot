# Brainstorming Report: Triad v16 Apex Multi-Domain Suite

## Problem Statement & Requirements
Hệ thống CashClaw Alpha Research OS và QuantLib liên tục mở rộng năng lực nghiên cứu định lượng tự động, vi cấu trúc thị trường và tối ưu hóa hạ tầng code.
Trong chu kỳ v16:
1. Cần một công cụ đo lường thanh khoản độc lập với spread giá: **Amihud (2002) Illiquidity Ratio Engine** nhằm đánh giá tác động giá trên một đơn vị khối lượng giao dịch.
2. Cần mô hình vi cấu trúc thời gian liên tục mô tả thời gian khớp lệnh theo hàng đợi Markov: **Cont-de Larrard (2013) First-Passage Queue Engine**.
3. Tiếp tục chiến dịch quản trị độ phức tạp mã nguồn (LOC Governance): Phân rã 2 file source tiệm cận 150 LOC (`schemas.ts` 162 LOC, `seam.ts` 155 LOC trong `src/forest/alpha/research-agent/`) về $\le 120$ LOC mà không thay đổi public contracts.

## Evaluated Approaches

### Trụ cột 1: Đo lường Thanh Khoản
- **Phương án A: Roll (1984) Effective Spread proxy**: Đo spread ngầm qua autocovariance giá, nhưng bị lỗi khi autocovariance dương (thị trường có xu hướng).
- **Phương án B: Amihud (2002) Illiquidity Ratio $\text{ILLIQ}$ (Được chọn)**:
  $$\text{ILLIQ}_t = \frac{1}{N} \sum_{i=1}^N \frac{|r_i|}{\text{Vol}_i}$$
  Chuẩn hóa với logarithmic transform, median clipping để kháng outliers, và phân loại chế độ thanh khoản cao/thấp.

### Trụ cột 2: Vi cấu trúc Hàng đợi Sổ lệnh LOB
- **Phương án A: Poisson Queue Đơn giản (M/M/1)**: Bỏ qua hình dạng bất đối xứng của LOB thực tế và hiện tượng hủy lệnh (cancellation).
- **Phương án B: Cont-de Larrard (2013) Markovian First-Passage Queue Engine (Được chọn)**:
  Tính toán xác suất lệnh giới hạn (Limit Order) được khớp trước khi hàng đợi bị xóa bỏ hoặc giá dịch chuyển:
  $$P(\text{Fill} \mid x, q) = \frac{\sinh(\gamma (L - x))}{\sinh(\gamma L)}$$
  với $x$ là vị trí hàng đợi, $L$ là độ sâu hàng đợi, và $\gamma = \sqrt{\delta / D}$ đại diện cho tỷ lệ hủy lệnh trên cường độ luồng lệnh.

### Trụ cột 3: Modularization Codebase
- Tách `cleanJsonString` và `parseRawJson` sang `schemas-json-parser.ts` (35 LOC), giảm `schemas.ts` từ 162 LOC xuống ~110 LOC.
- Tách `extractFailureReasons`, `extractJobMetrics`, và options sang `seam-job-extractors.ts` (50 LOC), giảm `seam.ts` từ 155 LOC xuống ~100 LOC.

## Final Recommended Solution
Thực thi đồng bộ cả 3 trụ cột theo chuẩn Apex:
- `src/tree/quantlib/liquidity/amihud-illiq-types.ts` & `amihud-illiq-engine.ts`
- `src/tree/quantlib/microstructure/cont-delarrard-queue-types.ts` & `cont-delarrard-queue-engine.ts`
- Phân rã modular `schemas.ts` và `seam.ts` trong `src/forest/alpha/research-agent/`
- Kiểm thử tích hợp toàn diện: `test/quant/v16-apex-suite-simulation.test.ts`.

## Success Metrics & Validation
- Tất cả unit tests và simulation tests chạy xanh 100%.
- Giữ vững toàn bộ 5,495+ test hiện có, 0 regression.
- 0 kiểu `:any`, 0 ESLint warnings, `npx tsc --noEmit` sạch.
- Mỗi file mới và đã tái cấu trúc đều $\le 120$ LOC.
