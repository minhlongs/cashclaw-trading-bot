# Báo Cáo Hoàn Tất Triển Khai — Issue #48 / PR #49

- **Ngày thực hiện:** 2026-11-09
- **Issue:** [#48](https://github.com/minhlongs/cashclaw-trading-bot/issues/48)
- **Pull Request:** [#49](https://github.com/minhlongs/cashclaw-trading-bot/pull/49) (Squash merged commit `a93893b9d7010f37c2d572eb30a1199894f0907e`)
- **Trạng thái:** Hoàn tất (`shipped`)

## 1. Mục tiêu đã hoàn thành (Done-means & Bằng chứng kiểm chứng)

| Hạng mục | Bằng chứng thực thi |
|---|---|
| 1. Ủy quyền `botActionStart/Stop/Pause/Resume` sang `botControlHandler` (`src/forest/dashboard/bot-actions.ts`) | `botActionStart`, `botActionStop`, `botActionPause`, và `botActionResume` ủy quyền trực tiếp sang `botControlHandler(id, action, userId)` (`src/forest/api/handlers/bot-control.ts`), bắt buộc kiểm tra `api_credentials` trong D1 khi khởi động bot (`start`) và chuẩn hóa lỗi `'Bot not found'` để tương thích ngược. Kiểm thử `src/forest/dashboard/bot-actions.test.ts` và `src/forest/dashboard/actions.test.ts` (29/29 tests) đều xanh. |
| 2. Truyền `userId` vào `getRecentEvents([id], userId)` trong `botDetailHandler` (`src/forest/api/handlers/bot-detail.ts`) | `botDetailHandler(id, userId?)` gọi `getRecentEvents([id], userId)` ở dòng 25. Kiểm thử `src/forest/api/handlers/bot-detail.test.ts` (14/14 tests) xác nhận `getRecentEvents` nhận đúng `(['bot-1'], 'usr_owner')`. |
| 3. Bảo vệ `GET /api/killswitch-status` trên Hono Worker (`src/worker-api-routes.ts`) bằng `authGuard()` | Chuyển `GET /api/killswitch-status` sang `registerProtectedRoutes` kèm `app.use('/api/killswitch-status', authGuard())` và `app.use('/api/killswitch-status/*', authGuard())`. Kiểm thử `src/worker-api-routes.test.ts` và `src/worker.test.ts` xác nhận trả `401` khi thiếu Bearer token và `200` khi hợp lệ. |
| 4. Cổng chất lượng & CI | 82/82 unit tests trên 7 file mục tiêu xanh; `npm run type-check`, `npm run lint`, `npx knip` 0 lỗi; tất cả file chạm tới `<= 200` LOC; CI trên PR #49 (`ci (22)` run `42558815064` & `Open-Core Boundary, Secret Hygiene & ADR-001 Paper-Only Gate` run `42558815072`) đều `pass`. |

## 2. Quyết định kỹ thuật đã thực hiện
- Sử dụng hàm chuẩn hóa `normalizeActionError` trong `src/forest/dashboard/bot-actions.ts` để giữ nguyên thông báo `'Bot not found'` cho các caller của Server Actions khi `botControlHandler` trả về `` `Bot not found: ${id}` ``, đảm bảo không phá vỡ hợp đồng lỗi hiện hữu.
- Bổ sung optional chaining (`manager.getOrCreateBot?.`, `manager.getBotOwnerId?.`, và kiểm tra `typeof bot.getConfig === 'function'`) trong `src/forest/api/handlers/bot-control.ts` để tương thích an toàn với các mock manager rút gọn trong bộ test Dashboard.

## 3. Hạng mục miễn trừ & Rủi ro tồn đọng
- **Miễn trừ:** Không có.
- **Theo dõi tiếp theo:** Không có.
- **Câu hỏi chưa giải quyết:** Không có.
