# Phase 02: Institutional L2 Cockpit UI & Real-Time Gauges

## Overview
- **Domain:** `src/components/dashboard/cockpit/`
- **Mục tiêu:** Xây dựng bộ giao diện Dark Terminal HUD trực quan hóa vi cấu trúc thị trường L2 và trạng thái an toàn hạm đội bot theo thời gian thực.

## Key Insights & Requirements
1. **L2 Depth Ladder (`l2-depth-ladder.tsx`):**
   - Hiển thị bậc thang độ sâu thanh khoản (Bid/Ask price levels, cumulative volume bars, visual spread indicator).
2. **Microstructure Toxicity Gauge (`microstructure-toxicity-gauge.tsx`):**
   - Hiển thị trực quan chỉ số OFI (-1.0 đến +1.0) và VPIN (0.0 đến 1.0) kèm nhãn trạng thái (`HEALTHY`, `CAUTION`, `TOXIC`).
3. **Fleet Risk Radar Card (`fleet-risk-radar-card.tsx`):**
   - Thẻ giám sát hạm đội bot: trọng số phân bổ vốn HRP, hệ số đòn bẩy Half-Kelly hiện tại, và thanh tiến trình Drawdown Circuit Breaker.
4. **Bilingual Localization:**
   - Cập nhật `src/messages/en.json` và `src/messages/vi.json` với namespace `dashboard.cockpit.*`.
5. **Design Tokens:**
   - 100% sử dụng semantic tokens (`src/styles/tokens.css`), 0 inline styles, responsive mobile/desktop.

## Related Code Files
- `src/components/dashboard/cockpit/cockpit-types.ts` (Tạo mới)
- `src/components/dashboard/cockpit/l2-depth-ladder.tsx` & test (Tạo mới)
- `src/components/dashboard/cockpit/microstructure-toxicity-gauge.tsx` & test (Tạo mới)
- `src/components/dashboard/cockpit/fleet-risk-radar-card.tsx` & test (Tạo mới)
- `src/messages/en.json` & `src/messages/vi.json` (Cập nhật)

## Todo List
- [ ] Định nghĩa `cockpit-types.ts`
- [ ] Triển khai `l2-depth-ladder.tsx` và test
- [ ] Triển khai `microstructure-toxicity-gauge.tsx` và test
- [ ] Triển khai `fleet-risk-radar-card.tsx` và test
- [ ] Cập nhật từ điển song ngữ en/vi
