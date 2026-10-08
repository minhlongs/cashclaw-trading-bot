# Phase 02: L2 Order Flow Imbalance (OFI) & VPIN Toxicity Alpha

## Context Links
- Report: `plans/reports/20261008-full-suite-advanced-quant-evolution-report.md`
- L2 Simulator: `src/tree/exchange/simulator/l2-types.ts`
- Feature Pipeline: `src/tree/alpha/`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Xây dựng engine tính toán Order Flow Imbalance (OFI) từ sổ lệnh L2 và Volume-Synchronized Probability of Toxicity (VPIN) từ luồng khớp lệnh, phục vụ làm feature nhân quả cho `AlphaResearchPipeline`.

## Architecture & Data Flow
1. Nhận chuỗi snapshot sổ lệnh L2 liên tiếp và trade stream.
2. `ofi-calculator.ts`: Tính toán dòng dịch chuyển thanh khoản tức thời giữa bid và ask:
   $$OFI_t = I_{\{P_{b,t} \ge P_{b,t-1}\}} v_{b,t} - I_{\{P_{b,t} \le P_{b,t-1}\}} v_{b,t-1} - I_{\{P_{a,t} \le P_{a,t-1}\}} v_{a,t} + I_{\{P_{a,t} \ge P_{a,t-1}\}} v_{a,t-1}$$
3. `vpin-calculator.ts`: Phân đoạn khối lượng thành các bucket kích thước $V$ cố định, ước tính tỷ lệ người giao dịch nắm thông tin bất đối xứng (toxicity).
4. `microstructure-signals.ts`: Chuẩn hóa $z$-score tín hiệu OFI/VPIN phục vụ ra quyết định định lượng.

## Related Code Files
- `src/tree/alpha/microstructure/microstructure-types.ts` (Create)
- `src/tree/alpha/microstructure/ofi-calculator.ts` (Create)
- `src/tree/alpha/microstructure/vpin-calculator.ts` (Create)
- `src/tree/alpha/microstructure/microstructure-signals.ts` (Create)
- `src/tree/alpha/microstructure/ofi-calculator.test.ts` (Create)
- `src/tree/alpha/microstructure/vpin-calculator.test.ts` (Create)
- `src/tree/alpha/microstructure/microstructure-signals.test.ts` (Create)

## Success Criteria
- 100% test coverage trên các file thuộc `src/tree/alpha/microstructure/`.
- Thuật toán streaming pure math, zero memory leak, file <= 200 LOC, 0 `:any`.
- Bất biến nhân quả (causal invariant): không nhìn trước tương lai.
