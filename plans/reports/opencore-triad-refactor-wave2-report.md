# Tái Cấu Trúc Toàn Diện Cụm Triad Wave 2 (Open-Core Triad Refactor Wave 2)
## Hoàn Tất 3 Cụm: Test Monolith Slicing, NOWPayments IPN SaaS Webhook, & QuantLib Microstructure CLI Eval

### 1. Tổng quan Kết quả Thực thi
Toàn bộ 3 cụm trọng điểm theo bản đề xuất Brainstorm Chuyên sâu (`--deep`) đã được triển khai, kiểm thử và tích hợp hoàn chỉnh:

1. **Cụm 1 — Triệt tiêu Triệt để 4 Test Monoliths (> 500 LOC):**
   - `src/tree/exchange/ws/binance-ws-connection.test.ts` (509 LOC) ➔ Tách thành 5 files (`<= 173 LOC`):
     - `binance-ws-test-utils.ts` (81 LOC)
     - `binance-ws-state.test.ts` (83 LOC)
     - `binance-ws-parsing.test.ts` (128 LOC)
     - `binance-ws-lifecycle.test.ts` (173 LOC)
     - `binance-ws-dispatch.test.ts` (136 LOC)
   - `src/tree/bot/bot-instance.test.ts` (547 LOC) ➔ Tách thành 4 files (`<= 175 LOC`):
     - `bot-instance-test-utils.ts` (96 LOC)
     - `bot-instance-lifecycle.test.ts` (131 LOC)
     - `bot-instance-execution.test.ts` (96 LOC)
     - `bot-instance-strategy.test.ts` (175 LOC)
   - `src/forest/alpha/research-agent/__tests__/e2e-research-agent.test.ts` (1,501 LOC) ➔ Tách thành 11 files (`<= 187 LOC`):
     - `e2e-test-utils.ts` (117 LOC)
     - `e2e-tier1-part1.test.ts` (113 LOC), `part2.test.ts` (187 LOC), `part3.test.ts` (85 LOC)
     - `e2e-tier2-part1.test.ts` (143 LOC), `part2.test.ts` (147 LOC), `part3.test.ts` (115 LOC)
     - `e2e-tier3-integration.test.ts` (171 LOC)
     - `e2e-tier4-part1.test.ts` (144 LOC), `part2.test.ts` (103 LOC)
     - `e2e-research-agent.test.ts` (24 LOC barrel)
   - `src/app/[locale]/backtests/backtests-client.test.tsx` (551 LOC) ➔ Tách thành 3 files (`<= 163 LOC`):
     - `backtests-test-helpers.tsx` (153 LOC)
     - `backtests-render-and-actions.test.tsx` (163 LOC)
     - `backtests-metrics-and-trades.test.tsx` (146 LOC)

2. **Cụm 2 — Cloud SaaS NOWPayments IPN Webhook & Tier Activation:**
   - Xây dựng `src/app/api/ee/billing/nowpayments-ipn/route.ts` (98 LOC):
     - Kiểm tra chữ ký mật mã WebCrypto HMAC-SHA512 (`crypto.subtle`) qua header `x-nowpayments-sig` trên payload JSON chuẩn hóa sắp xếp khóa (`canonicalizeNowPaymentsJson`).
     - Bảo vệ chống tấn công phát lại (Anti-Replay Window 300s) qua header `x-nowpayments-timestamp`.
     - Xử lý nạp tiền & kích hoạt gói dịch vụ bất biến (`BASIC | PREMIUM | ENTERPRISE | MASTER`).
     - Đảm bảo tính lũy nghiệm (Idempotency) tuyệt đối đối với các webhook trùng lặp.
   - Viết bộ kiểm thử toàn diện `src/app/api/ee/billing/nowpayments-ipn/route.test.ts` (145 LOC): 6/6 tests passed (401, 403 replay, 403 bad sig, 400 schema, 200 activated & idempotent replay).

3. **Cụm 3 — Quantitative Microstructure & CLI `eval` Expansion:**
   - Triển khai `src/tree/quantlib/liquidity/amihud-illiquidity-engine.ts` (14 LOC) & unit test (47 LOC): Ước lượng tỷ số thanh khoản Amihud (2002) Illiquidity Ratio ($|R| / V$).
   - Triển khai `src/tree/quantlib/microstructure/roll-effective-spread-engine.ts` (19 LOC) & unit test (33 LOC): Ước lượng chênh lệch giá Roll (1984) Effective Spread dựa trên hiệp phương sai chuỗi thời gian biến động giá ($2\sqrt{-\text{Cov}}$).
   - Xuất khẩu vào public barrel `src/tree/quantlib/public-sdk.ts` (65 LOC).
   - Cập nhật lệnh CLI `cashclaw eval` (`bin/cashclaw.js` và `bin/lib/commands.js`) hỗ trợ tính toán và hiển thị cả Amihud Illiquidity và Roll Effective Spread.

### 2. Trạng thái Kiểm thử & Chuẩn Code
- **Vitest:** 337/337 tests passed trên toàn bộ 28 test files liên quan.
- **TypeScript:** `npx tsc --noEmit` hoàn toàn sạch sẽ, 0 lỗi cú pháp hay kiểu dữ liệu (`0 :any`).
- **File Size Management:** Tất cả 29 files mới hoặc chỉnh sửa đều tuân thủ nghiêm ngặt quy tắc `< 200 LOC` (cao nhất 187 LOC).
