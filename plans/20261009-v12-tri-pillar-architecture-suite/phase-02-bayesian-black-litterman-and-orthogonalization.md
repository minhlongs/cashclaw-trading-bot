# Phase 02: Bayesian Black-Litterman & Factor Orthogonalization

## Mục tiêu
Tích hợp mô hình phân bổ danh mục Bayes Black-Litterman kết hợp quan điểm định tính của AI agent với phân bổ cân bằng thị trường, kèm theo thuật toán Gram-Schmidt trực giao hóa các nhân tố alpha trên mảng `Float64Array`.

## Files tạo mới / cập nhật
1. `src/tree/research/vectorized/vectorized-orthogonalizer.ts` (<= 120 LOC)
   - Thuật toán Gram-Schmidt vector hóa cho `VectorizedSeries[]`, loại bỏ đa cộng tuyến giữa các factor.
2. `src/tree/quantlib/portfolio/black-litterman-types.ts` (<= 50 LOC)
   - Types cho MarketPrior, AgentView, BlackLittermanResult, PortfolioWeights.
3. `src/tree/quantlib/portfolio/black-litterman-engine.ts` (<= 150 LOC)
   - Đảo ma trận giải tích $N \le 3$, tính $\mu_{BL} = [(\tau \Sigma)^{-1} + P^T \Omega^{-1} P]^{-1} [(\tau \Sigma)^{-1} \Pi + P^T \Omega^{-1} Q]$.
4. `test/quant/bayesian-black-litterman.test.ts` (<= 140 LOC)
   - Unit tests cho Black-Litterman và Gram-Schmidt.

## Tiêu chí thành công
- File <= 160 LOC, 0 `:any`.
- Unit tests pass 100%.
