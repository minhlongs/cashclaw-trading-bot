# Phase 01: Multi-Venue Basis & Funding Rate Arbitrage Engine

## Context Links
- Report: `plans/reports/brainstorm-deep-3-pillars-report.md`
- Core Roadmap: `docs/development-roadmap.md`
- Rest Clients: `src/tree/exchange/direct/`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Xây dựng module trích xuất Funding Rate và Basis Spread trên 3 sàn (Binance, OKX, Bybit), tính toán net edge sau phí và sinh tín hiệu Delta-neutral arbitrage.

## Architecture & Data Flow
1. Polling Funding Rate & Mark Price từ `BinanceRestClient`, `OkxRestClient`, `BybitRestClient`.
2. Chuẩn hóa canonical symbol qua `symbol-normalizer.ts`.
3. Tính toán $\Delta \text{Funding Rate}$ và Basis Spread annualized.
4. Phát sinh tín hiệu arbitrage khi net edge vượt ngưỡng chi phí giao dịch + trượt giá.

## Related Code Files
- `src/tree/exchange/arbitrage/funding-types.ts` (Create)
- `src/tree/exchange/arbitrage/funding-monitor.ts` (Create)
- `src/tree/exchange/arbitrage/basis-calculator.ts` (Create)
- `src/tree/exchange/arbitrage/funding-monitor.test.ts` (Create)
- `src/tree/exchange/arbitrage/basis-calculator.test.ts` (Create)

## Success Criteria
- 100% test coverage trên các module arbitrage mới.
- Xử lý hoàn hảo các ngoại lệ mạng và bất đối xứng format giữa 3 sàn.
- File <= 200 LOC, 0 `:any`.
