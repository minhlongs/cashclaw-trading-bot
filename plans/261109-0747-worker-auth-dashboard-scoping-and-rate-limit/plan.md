---
title: "Harden Worker Telemetry Auth, Dashboard Multi-Tenant Scoping & Per-User Rate-Limit Isolation"
description: "Mount authGuard on worker /api/events and /api/stats/daily, scope dashboard server actions by userId, unify botControlHandler preflight, and isolate rate-limit buckets per userId"
status: completed
priority: P1
effort: 2h
branch: fix/worker-auth-dashboard-scoping-and-rate-limit
tags: [security, multi-tenant, worker, dashboard, rate-limit]
created: 2026-11-09
updated: 2026-11-09
issue: 45
---

# Plan: Harden Worker Telemetry Auth, Dashboard Multi-Tenant Scoping & Per-User Rate-Limit Isolation (#45)

## Objective
Đóng kín 3 lỗ hổng bảo mật xác thực, cô lập đa người dùng và giới hạn tốc độ trong một đợt triển khai duy nhất:
1. Gắn `authGuard()` lên `GET /api/events` và `GET /api/stats/daily` trên Hono Worker (`src/worker-api-routes.ts`).
2. Bổ sung tham số tùy chọn `userId?: string` và kiểm tra quyền sở hữu bot trên toàn bộ Server Actions của Dashboard (`src/forest/dashboard/*.ts`) và `BotQueryService.getBot(id, userId?)` (`src/forest/bot/bot-query-service-class.ts`).
3. Hợp nhất `executeBotControl` (`src/forest/api/handlers/bot-detail-control.ts`) về `botControlHandler` chuẩn (`src/forest/api/handlers/bot-control.ts`) để kiểm tra `api_credentials` khi `start`, đồng thời tách khóa `checkRateLimit` theo `x-user-id` trên `POST /api/alpha/research` và `POST /api/settings`.

## Phases

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Hono Worker `authGuard()` cho `/api/events` & `/api/stats/*` | Completed |
| Phase 2 | Multi-tenant `userId` scoping trên `BotQueryService.getBot` & `src/forest/dashboard/*.ts` | Completed |
| Phase 3 | Hợp nhất `botControlHandler` preflight & tách `checkRateLimit` theo `x-user-id` | Completed |
| Phase 4 | Unit tests, `tsc`, `eslint`, `knip`, code review độc lập & mở PR | Completed |

## Acceptance Criteria
- [x] `src/worker-api-routes.ts` gắn `authGuard()` cho `/api/events`, `/api/events/*`, và `/api/stats/*`; `GET /api/events` và `GET /api/stats/daily` trả `401` khi thiếu Bearer token hợp lệ và `200` khi có token.
- [x] `BotQueryService.getBot(id, userId?)` lọc `WHERE id = ? AND user_id = ?` khi có `userId`.
- [x] `getDashboardData(userId?)`, `getKpis(userId?)`, `getBotCards(userId?)`, `getAllBots(userId?)`, `getBotDetail(id, userId?)`, `getTradeHistory(botId, limit?, userId?)`, `getRecentEvents(botIds?, userId?)`, `getCapitalSnapshots(botId, limit?, userId?)`, và `botActionStart/Stop/Pause/Resume(id, userId?)` kiểm tra quyền sở hữu theo `userId`.
- [x] `executeBotControl` ủy quyền sang `botControlHandler` chuẩn; `POST /api/alpha/research` và `POST /api/settings` tách bucket `checkRateLimit` theo `x-user-id`.
- [x] 12/12 file test (125/125 tests) xanh, `npm run type-check`, `npm run lint`, và `npx knip` 0 lỗi, tất cả file <= 200 LOC.
