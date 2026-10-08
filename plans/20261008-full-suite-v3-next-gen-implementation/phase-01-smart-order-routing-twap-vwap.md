# Phase 01: Smart Order Routing (SOR), TWAP/VWAP Slicing & Microstructure Urgency Guard

## Overview
- **Domain:** `src/tree/execution/smart/`
- **Mục tiêu:** Xây dựng thuật toán cắt lát lệnh (order slicing) tối ưu trượt giá theo TWAP/VWAP, đồng thời tích hợp lá chắn khẩn cấp điều chỉnh nhịp độ khớp dựa trên tín hiệu vi cấu trúc L2 OFI và VPIN toxicity.

## Key Insights & Requirements
1. **TWAP Slicer (`twap-slicer.ts`):**
   - Cắt một lệnh lớn kích thước $Q$ thành $N$ slices trong khoảng thời gian $T$.
   - Bổ sung randomized jitter (±20%) cho thời gian chờ giữa các slice để xóa dấu vết thuật toán.
2. **VWAP Scheduler (`vwap-scheduler.ts`):**
   - Phân bổ tỷ trọng khối lượng theo đường cong phân bố khối lượng 24h đặc thù của crypto (đỉnh phiên Á, Âu, Mỹ).
3. **Microstructure Urgency Guard (`microstructure-urgency-guard.ts`):**
   - Khi $VPIN \ge 0.70$ hoặc $|OFI| \ge 0.60$ nghịch chiều: chuyển mode từ `AGGRESSIVE_TAKER` sang `PASSIVE_POST_ONLY` hoặc `PAUSED_COOLDOWN`.
4. **Smart Order Router (`sor-router.ts`):**
   - Phân chia khối lượng giữa các sàn (Binance, OKX, Bybit) dựa trên độ sâu sổ lệnh tốt nhất và phí giao dịch.

## Related Code Files
- `src/tree/execution/smart/smart-execution-types.ts` (Tạo mới)
- `src/tree/execution/smart/twap-slicer.ts` & test (Tạo mới)
- `src/tree/execution/smart/vwap-scheduler.ts` & test (Tạo mới)
- `src/tree/execution/smart/microstructure-urgency-guard.ts` & test (Tạo mới)
- `src/tree/execution/smart/sor-router.ts` & test (Tạo mới)

## Todo List
- [ ] Định nghĩa contracts tại `smart-execution-types.ts`
- [ ] Triển khai `twap-slicer.ts` và unit tests
- [ ] Triển khai `vwap-scheduler.ts` và unit tests
- [ ] Triển khai `microstructure-urgency-guard.ts` và unit tests
- [ ] Triển khai `sor-router.ts` và unit tests
