# Báo cáo hoàn thành tự động — Đóng 3 mũi bảo mật đa người dùng (Issue #41)

Ngày: 08/11/2026 · Nhánh gốc: `fix/ee-alert-secret-and-workspace-isolation` · Trạng thái: **ĐÃ GIAO XONG (SHIPPED)**

## 1. Mục tiêu (đã xác nhận ở Gate 1)

Đóng đồng thời 3 lỗ hổng cô lập dữ liệu giữa các người dùng trên nhánh `main`:

1. **Cô lập cài đặt theo từng người dùng** — API `/api/settings` phải đọc/ghi riêng
   (`id = settings_<userId>`, `user_id = userId`) và đối chiếu khoá API trong bảng
   `api_credentials` (`id = cred_<userId>_<exchange>`) để bước kiểm tra trước khi khởi động
   bot trong `botControlHandler` thực sự tìm thấy thông tin xác thực.
2. **Tạo bot paper thật ở `POST /api/ee/sync`** — gọi `botCreateHandler` với `mode: 'paper'`,
   gắn theo `x-user-id`, và trả `botId` trong phản hồi JSON 200.
3. **Xác thực phiên làm việc & phân quyền D1** cho `/api/metrics` và `/api/killswitch-status`.

## 2. Kết quả theo từng tiêu chí "Done means"

| # | Tiêu chí | Bằng chứng |
|---|---|---|
| 1 | Cài đặt & khoá API ghi riêng theo `userId` | PR #42 merge `882571e` — CI xanh |
| 2 | Đối chiếu khoá API trước khi khởi động bot | PR #42 — `botControlHandler` truy vấn `api_credentials` theo người dùng |
| 3 | `POST /api/ee/sync` tạo bot paper thật | PR #42 — `botCreateHandler(..., 'user_sync_1')`, trả `botId` |
| 4 | Phiên làm việc + phân quyền D1 cho 2 route còn lại | PR #42 — kiểm tra phiên trước khi đọc D1 |
| 5 | Sửa 3 phát hiện biên từ đợt review tách biệt | PR #43 merge `14d75a5f` — CI xanh |

### 2.1 PR #42 — phần chính (đã merge `882571e00e88e4d8defe3930fc699b40c5cb57f4`)

- `src/forest/settings/actions-d1.ts` — lưu/truy xuất theo `settings_<userId>`.
- `src/forest/settings/actions-ops.ts` — ghi bản sao khoá API vào `api_credentials`
  (`cred_<userId>_<exchange>`) ngay khi lưu cài đặt.
- `src/forest/api/handlers/bot-control.ts` — bước kiểm tra trước khi khởi động lấy đúng
  khoá API của người dùng đó.
- `src/tree/bot/bot-manager-d1-status.ts` + `src/forest/api/handlers/bots.ts` — tạo bot
  `mode: 'paper'` theo người dùng, trả `botId`.
- Session check (`SENSITIVE_GET_PREFIXES`) + phân quyền D1 cho `/api/metrics`,
  `/api/killswitch-status`.

### 2.2 PR #43 — cứng hoá biên (`14d75a5fc6260769708e9f4719967b945ace3b84`)

Ba điểm mà đợt review tách biệt (`code-reviewer`) phát hiện, đã sửa hết:

1. **Đối chiếu khoá API mặc định** — khi không có `userId` cũng không có `ownerId`,
   truy vấn phải gắn `'default'` (đúng dòng mà `syncExchangeToD1` ghi khi chưa đăng nhập),
   thay vì `null`. Kỹ thuật: `const effectiveUserId = userId ?? ownerId ?? 'default';`
2. **Sàn giao dịch trong `/api/ee/sync`** — chuẩn hoá về chữ thường, chỉ nhận
   `binance`/`bybit`/`okx`, mọi giá trị lạ rơi về `binance`; `capital` chỉ nhận số dương
   hữu hạn ≤ 1.000.000, nếu không thì về mặc định 1000 (tránh lỗi ràng buộc D1).
3. **Tên bot khi đồng bộ** — `persistNewBot` giờ lưu `config.name` (tên người dùng tự
   đặt) và chỉ quay về `botId` khi không có tên.

## 3. Kiểm tra đã chạy

| Hạng mục | Kết quả |
|---|---|
| Unit test (56 test, 6 file liên quan) | **Xanh** |
| `npm run type-check` | **0 lỗi** |
| `npm run lint` | **0 lỗi / 0 cảnh báo** |
| `npx knip` (code thừa) | **Sạch** |
| CI trên PR #43 (2 workflow) | **SUCCESS** |
| CI trên `main` `14d75a5f` (2 workflow) | **SUCCESS** |
| Cổng ADR-001 (chỉ paper/backtest) | **Đạt** |
| Kiểm tra bí mật & biên open-core | **Đạt** |

## 4. Quyết định đã tự chọn

- **Gộp cả 3 hạng mục vào một đợt** (người dùng đã chọn) thay vì tách ba PR — vì cả ba
  cùng chạm luồng "người dùng → D1", tách ra sẽ phải sửa chung nhiều đoạn hai lần.
- **Squash merge** cho cả PR #42 và PR #43 để `main` giữ một commit sạch mỗi thay đổi.
- **Nhánh theo dõi riêng** (`fix/sync-exchange-preflight-and-bot-name`) cho phần cứng hoá
  biên, để phần chính đã ổn định không bị chạ lại CI. Nhánh đã xoá sau khi merge.
- **Không đổi hợp đồng API công khai** — chỉ siết phân quyền phía trong.

## 5. Còn lại cần theo dõi

- Không có lỗi mở, không có tiến trình nền nào còn chạy của worktree này, không có nhánh
  dư trên `origin`.

## 6. Nơi tra cứu

- Issue: <https://github.com/minhlongs/cashclaw-trading-bot/issues/41> (đã đóng, nhãn `shipped`)
- PR #42: <https://github.com/minhlongs/cashclaw-trading-bot/pull/42>
- PR #43: <https://github.com/minhlongs/cashclaw-trading-bot/pull/43>
