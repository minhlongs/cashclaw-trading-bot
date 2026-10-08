# Phase 01: Graph-Theoretic Triangular Arbitrage Engine

## Overview
- **Priority:** High
- **Status:** Pending
- **Mục tiêu:** Xây dựng engine phát hiện chu trình arbitrage tam giác qua đồ thị tỷ giá logarit và thuật toán Bellman-Ford Negative Cycle Detection.

## Architecture & Mathematical Specification
1. **Đồ thị Tỷ giá Logarit (`triangular-rate-graph.ts`):**
   - Biểu diễn mạng lưới các cặp giao dịch dưới dạng đồ thị có hướng $G = (V, E)$.
   - Đỉnh $V$ là các tài sản cơ sở (ví dụ: `USDT`, `BTC`, `ETH`, `SOL`).
   - Cạnh $(u, v)$ có trọng số:
     $$w(u, v) = -\ln(R_{u \to v} \times (1 - \text{fee}_{u \to v}))$$
   - Khi tỷ giá ngược chiều (bán $v$ lấy $u$), tính theo $1 / \text{AskPrice}$ tương ứng kèm phí taker.
2. **Thuật toán Bellman-Ford Negative Cycle (`bellman-ford-detector.ts`):**
   - Tìm kiếm chu trình âm với độ dài 3 (tam giác) xuất phát từ tiền tệ gốc (thường là USDT).
   - Khi $\sum_{i=1}^3 w(e_i) < 0$, tỷ giá tích lũy thỏa mãn:
     $$\prod_{i=1}^3 R_i (1 - \text{fee}_i) > 1.0$$
   - Trả về đối tượng `TriangularArbitrageOpportunity`:
     - Danh sách 3 cạnh tạo thành chu trình (`legs`).
     - Tỷ lệ lợi nhuận ròng dự kiến (`netProfitRatioPct`).
     - Dung lượng thanh khoản khả thi nhỏ nhất (`bottleneckSize`).

## Files to Create / Modify
- Create: `src/tree/quantlib/arbitrage/triangular-types.ts` (<= 80 LOC)
- Create: `src/tree/quantlib/arbitrage/triangular-rate-graph.ts` (<= 120 LOC)
- Create: `src/tree/quantlib/arbitrage/bellman-ford-detector.ts` (<= 130 LOC)
- Create: `src/tree/quantlib/arbitrage/triangular.test.ts` (<= 160 LOC)

## Success Criteria
- Thuật toán phát hiện chính xác cơ hội chênh lệch giá giả lập với độ trễ $< 1\text{ms}$.
- Loại bỏ triệt để các chu trình âm giả tạo do phí giao dịch gây ra.
- 100% statement/branch/line coverage trên toàn bộ các file mới.
