---
title: "Unify Dashboard Bot Actions Preflight, Forward userId to getRecentEvents & Guard Worker Killswitch-Status"
description: "Delegate botActionStart/Stop/Pause/Resume to botControlHandler, pass userId to getRecentEvents in botDetailHandler, and mount authGuard on Hono /api/killswitch-status"
status: completed
priority: P1
effort: 1h
branch: fix/server-actions-preflight-and-worker-killswitch-auth
tags: [security, multi-tenant, worker, dashboard, preflight]
created: 2026-11-09
updated: 2026-11-09
issue: 48
---

# Plan: Unify Dashboard Bot Actions Preflight, Forward userId to getRecentEvents & Guard Worker Killswitch-Status (#48)

## Objective
Đóng kín 3 lỗ hổng bảo mật chiều sâu (defense-in-depth) trong một đợt triển khai:
1. Ủy quyền `botActionStart/Stop/Pause/Resume` (`src/forest/dashboard/bot-actions.ts`) sang `botControlHandler` (`src/forest/api/handlers/bot-control.ts`) để bắt buộc kiểm tra `api_credentials` trong D1 khi khởi động bot (`start`).
2. Truyền `userId` vào `getRecentEvents([id], userId)` trong `botDetailHandler` (`src/forest/api/handlers/bot-detail.ts`).
3. Chuyển `GET /api/killswitch-status` trên Hono Worker (`src/worker-api-routes.ts`) sang `registerProtectedRoutes` kèm `authGuard()`.

## Phases

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Ủy quyền `botAction*` sang `botControlHandler` kèm chuẩn hóa thông báo lỗi | Completed |
| Phase 2 | Truyền `userId` vào `getRecentEvents([id], userId)` trong `botDetailHandler` | Completed |
| Phase 3 | Bảo vệ `GET /api/killswitch-status` bằng `authGuard()` trên Hono Worker | Completed |
| Phase 4 | Unit tests, `tsc`, `eslint`, `knip`, code review độc lập & mở PR | Completed |

## Acceptance Criteria
- [x] `botActionStart`, `botActionStop`, `botActionPause`, `botActionResume` ủy quyền qua `botControlHandler(id, action, userId)` và chặn khởi động khi thiếu `api_credentials` trong D1.
- [x] `botDetailHandler(id, userId?)` gọi `getRecentEvents([id], userId)`.
- [x] `src/worker-api-routes.ts` gắn `authGuard()` cho `/api/killswitch-status` và `/api/killswitch-status/*`; trả `401` khi thiếu Bearer token và `200` khi hợp lệ.
- [x] Tất cả unit tests, `npm run type-check`, `npm run lint`, và `npx knip` 0 lỗi, mọi file chạm tới `<= 200` LOC.
