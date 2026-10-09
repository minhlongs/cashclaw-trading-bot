# Phase 04: Full-Suite Simulation & Verification

## Mục tiêu
Tích hợp toàn diện 3 trụ cột vào bài kiểm thử mô phỏng đa tầng E2E `test/quant/v12-full-suite-simulation.test.ts`, chạy toàn bộ test suite, kiểm tra TypeScript và xác thực production build.

## Các bước thực hiện
1. Viết `test/quant/v12-full-suite-simulation.test.ts` liên kết:
   - Factor Orthogonalization $\to$ Black-Litterman Portfolio $\to$ Kyle-Back OMS Waterfall $\to$ Post-Trade Slippage Attribution.
2. Kiểm tra toàn bộ test suite `npm test`.
3. Kiểm tra TypeScript compile `npx tsc --noEmit`.
4. Kiểm tra Next.js build `npm run build`.
5. Cập nhật roadmap, changelog, memory file và commit git.

## Tiêu chí thành công
- Tất cả các tests chạy qua 100% green.
- Zero error, zero warning.
