# Báo cáo hoàn thành — Đóng lỗ rò rỉ dữ liệu giữa các tài khoản trên đường dẫn Bot

Ngày: 2026-11-08 · Nhánh: `fix/bot-route-user-isolation` · PR: [#40](https://github.com/minhlongs/cashclaw-trading-bot/pull/40) (đã gộp vào `main`) · Issue: [#39](https://github.com/minhlongs/cashclaw-trading-bot/issues/39) (nhãn `shipped`)

## Kết quả

Đã gộp PR #40 vào `main` bằng squash (commit `e40c0629`), CI trên `main` xanh cho cả commit gộp và commit cập nhật hồ sơ kế hoạch (`cb2e3b6`). Toàn bộ 7 tiêu chí nghiệm thu đã được kiểm chứng bằng nguồn và bài kiểm thử.

Có một điều quan trọng phát sinh sau khi review: các lệnh kiểm tra quyền sở hữu ban đầu đọc một thuộc tính không tồn tại trên đối tượng bot, nên về thực tế chúng không hề hoạt động. Đã sửa bằng cách đọc quyền sở hữu từ chỗ lưu trữ thật của hệ thống.

## Vấn đề gốc và hướng xử lý

Nền tảng lưu trữ đã sẵn sàng cho việc phân chia theo người dùng (cột `user_id` trong D1, chỉ mục `idx_bots_user_id`, các hàm đọc/lọc theo người dùng của `BotManager`), nhưng lớp HTTP không bao giờ truyền danh tính người dùng xuống:

1. **`GET /api/bots` trả về bot của mọi tài khoản** — hàm liệt kê được gọi không kèm người dùng, nên truy vấn trả về toàn bộ dòng dữ liệu. Nay truyền `x-user-id` xuống và chỉ trả về bot của người đang đăng nhập.
2. **Tạo bot không ghi nhận chủ sở hữu và không được lưu** — hàm tạo gọi thiếu danh tính, nên bot sinh ra không gắn chủ và biến mất ở lần đọc D1 tiếp theo. Nay gửi kèm người dùng, nhờ đó bot được lưu và gắn chủ.
3. **Hạn mức bị tính chéo giữa các tài khoản** — khi đếm số bot đang chạy, cả hai đường dẫn đều liệt kê bot của tất cả người dùng, nên người này bị chặn bởi bot của người khác. Nay chỉ đếm bot của tài khoản hiện tại.
4. **Có thể xem/thao tác bot của người khác** — các đường dẫn xem chi tiết, điều khiển, cập nhật cấu hình không truyền người dùng. Nay truyền xuống, và bot của người khác trả về mã 404 giống như bot không tồn tại, nên kẻ khác thử nghiệm không thể đoán biết bot đó có thật hay không.
5. **Thanh toán khi người dùng chưa thuộc không gian làm việc nào** — trước đây trả về lỗi 401, nay chuyển sang dùng không gian cá nhân cố định (`ws_<mã người dùng>`) giống các đường dẫy EE khác; nếu không đăng nhập thì vẫn giữ nguyên lỗi 401.

## Phát sinh từ bước review độc lập — quyền sở hữu đọc từ chỗ sai

Lỗi nghiêm trọng nhất phát hiện ra lúc review: đối tượng bot (`BotInstance`) không hề có trường ghi chủ sở hữu. Quyền sở hữu thật nằm ở bản ghi lưu trong bộ nhớ đệm của bộ quản lý. Vì vậy mọi lệnh kiểm tra quyền sở hữu trước đây đều đọc một giá trị luôn rỗng, khiến điều kiện từ chối không bao giờ kích hoạt — người dùng lạ vẫn đi qua được nếu tra cứu trả về bot.

Cách sửa:

- Thêm hàm lấy chủ sở hữu trên bộ nhớ đệm và bộ quản lý (`getBotOwnerId`), dữ liệu lấy trực tiếp từ bản ghi lưu.
- Chuyển toàn bộ kiểm tra quyền sở hữu trong các hàm xử lý sang dùng hàm này, thay cho việc ép kiểu một trường không tồn tại.
- Viết lại các bài kiểm thử liên quan để dẫn dữ liệu quyền sở hữu qua chính hàm lấy chủ sở hữu.

Hai điểm cải tiến khác:

**Lỗ hổng đoán sự tồn tại qua mã trạng thái.** Một lệnh tiếp tục chạy bot bị từ chối trước đây trả về 200 trong khi lệnh dừng trả về 404, cho phép phân biệt "bot tồn tại nhưng không phải của bạn" với "bot không tồn tại". Nay cả hai đều ra 404.

**Điều kiện chạy bot đọc dữ liệu hai lần.** Bước kiểm tra trước khi khởi động đọc lại bot để lấy thông tin sàn giao dịch, mà bộ nhớ đệm có thời hạn 30 giây nên lần đọc thứ hai có thể trượt. Nay dùng giá trị đã lấy được sẵn. Có hai bài kiểm thử mới giữ cố định hành vi này.

## Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| `npm run type-check` | Không lỗi |
| `npm run lint` (`--max-warnings 0`) | 0 cảnh báo |
| `vitest run --coverage` | 6156 bài kiểm thử / 734 tệp, tất cả đạt |
| `npx knip` | Sạch |
| `npm run quality:gate` | Thoát với mã 0 |

Kiểm tra bổ sung: đường dẫn dành cho người vận hành (Hono `/internal/api/bots`) không có thay đổi nào trong cả hai commit, vì mọi hàm giữ nguyên số tham số khi không có người dùng. Không có bảng `console.log` trong mã chạy thật, không có kiểu `:any`, mọi tệp sửa đổi đều dưới 200 dòng. Không có di chuyển cơ sở dữ liệu. Nguyên tắc chỉ cho phép giao dịch giả/kiểm thử (ADR-001) được giữ nguyên. PR nháp #35 không bị đụng đến.

## Các quyết định đã tự chọn

- **Dùng hàm lấy chủ sở hữu thay vì ép kiểu trường.** Ép kiểu một trường không tồn tại là nguyên nhân gốc của lỗ hổng; thêm hàm truy cập thật giúp kiểm soát kiểu và kiểm thử được hành vi.
- **Mở rộng điều kiện nhận diện lỗi "không tìm thấy" thành "không tìm thấy hoặc bị từ chối".** Từ chối bot của người khác phải không phân biệt được với bot không có.
- **Không sửa điểm M3 của review** (hành vi thanh toán khi D1 không khả dụng) vì nằm ngoài phạm vi: hành vi 401 khi không có phiên đăng nhập là đúng và đã có bài kiểm thử.

## Việc còn lại

Không có việc chặn. Kế hoạch `261108-0107` đã được đóng và ghi nhận PR #40 trong kho kế hoạch. Không có tiến trình hay thư mục làm việc tạm nào bị bỏ lại.
