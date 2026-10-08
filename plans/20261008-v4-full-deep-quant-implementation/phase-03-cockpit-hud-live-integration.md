# Phase 03: Dashboard Cockpit HUD: Live Telemetry, Gauges & Bilingual i18n

## Overview
- Priority: Medium
- Status: Pending
- Objective: Gắn trực tiếp L2 Depth Ladder, Microstructure Toxicity Gauge và Fleet Risk Radar Card vào `DashboardClient`, hỗ trợ đa ngôn ngữ hoàn chỉnh.

## Architecture & Responsibilities
- `src/components/dashboard/dashboard-client.tsx`:
  - Mount cụm Institutional Cockpit HUD bên cạnh Market Watch và Fleet metrics.
- `src/messages/en.json` & `src/messages/vi.json`:
  - Đồng bộ các khóa dịch: `dashboard.cockpit.*`.

## Implementation Steps
1. Bổ sung i18n messages song ngữ trong `en.json` và `vi.json`.
2. Tích hợp Cockpit widgets vào `DashboardClient` với semantic CSS tokens.
3. Cập nhật và chạy kiểm thử cho Dashboard client components.

## Success Criteria
- Files <= 200 LOC, 0 `:any`.
- `npm run build` thành công, SSR/Hydration sạch sẽ.
