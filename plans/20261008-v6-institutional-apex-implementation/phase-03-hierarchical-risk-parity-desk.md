# Phase 03: Hierarchical Risk Parity (HRP) & Copula Tail-Risk Desk

## Context & Objectives
Triển khai bộ phân bổ danh mục theo rủi ro phân cụm (HRP) và phòng vệ đuôi Copula tại `src/forest/allocation/hrp/`:
1. `hrp-types.ts`: Định nghĩa ma trận tương quan, nút phân cụm Dendrogram, trọng số HRP và số đo CVaR.
2. `dendrogram-clusterer.ts`: Khoảng cách tương quan $d = \sqrt{(1-\rho)/2}$, liên kết đơn (single-linkage) và sắp xếp tựa chéo (quasi-diagonalization).
3. `hrp-capital-allocator.ts`: Phân bổ vốn đệ quy phân đôi nghịch đảo phương sai (recursive bisection inverse-variance), triệt tiêu hoàn toàn rủi ro suy biến ma trận.
4. `copula-tail-risk-guard.ts`: Clayton Copula lower-tail dependence và Liquidity-adjusted Tail Risk CVaR.
5. Unit test suite `hrp.test.ts` đạt 100% test coverage.

## Todo List
- [ ] Tạo `src/forest/allocation/hrp/hrp-types.ts` (<= 100 LOC)
- [ ] Tạo `src/forest/allocation/hrp/dendrogram-clusterer.ts` (<= 130 LOC)
- [ ] Tạo `src/forest/allocation/hrp/hrp-capital-allocator.ts` (<= 130 LOC)
- [ ] Tạo `src/forest/allocation/hrp/copula-tail-risk-guard.ts` (<= 120 LOC)
- [ ] Tạo `src/forest/allocation/hrp/hrp.test.ts` (<= 140 LOC)
- [ ] Chạy vitest xác minh 100% test pass.
