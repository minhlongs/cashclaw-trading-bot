# Báo cáo OPC Trading Platform — 2026-10-29

## A. Kết luận

**PARTIAL — không bật giao dịch live, không triển khai production.**

Đã hoàn thành và kiểm chứng luồng Operations owner-scoped trên OpenNext Worker với D1 local thật, xác thực bằng login/session của ứng dụng, hai user tổng hợp A/B, audit history có version và persistence qua lần dừng/khởi động lại Worker. Đã sửa lỗi API trả 409 giả khi D1 trigger ghi history và lỗi trang `/en/operations` render tiếng Việt. Full test/type-check/lint/build đều đạt.

Không thể kết luận toàn nền tảng DONE: năm bộ phận mới dùng chung work queue; chưa phải ERP/CRM/helpdesk; chưa xác minh tenancy/RBAC/billing production; backtest/paper run là synthetic; production backtest write path chưa được chạy toàn vẹn qua ứng dụng; live adapter thiếu policy production; browser automation không có; Knip chặn quality gate do lỗi cấp phát buffer. Không có deploy, remote D1 migration, lệnh thật, giao dịch live hoặc thanh toán.

## B. Repo, phạm vi và thay đổi

- Repo `minhlongs/cashclaw-trading-bot`, branch `arena/06ec4bf4-cashclaw-trading-bot` (giữ nguyên), base `11a774e820920dfbdb8e0ee52fe4599a69851770`.
- Commit local: `c67486b10ad666e47db73914bb716bba4df3f1ad` — `Harden session-scoped operations workflow`.
- PR #34 đã được xác nhận là merge vào base; không áp dụng lại patch cũ.
- Thêm migration `0015_ops_work_item_concurrency.sql`: CAS `version`, trigger ghi sự kiện status, bảo vệ event log append-only.
- Thêm resolver session dùng `user_sessions.id` và expiry epoch seconds; API Operations lấy userId từ session server-side thay vì tin header; middleware fail-closed, loại `x-user-id` client và chặn mutation cross-origin/cross-site.
- Chuyển status update sang `UPDATE … RETURNING`; event history trả version; create event bắt đầu ở version 0.
- Cố định locale vào `getMessages` và `NextIntlClientProvider`, sửa `/en/operations` bị render tiếng Việt.
- Cập nhật tests và `docs/opc-platform-readiness.md`.

## C. Operations API/security — E2E D1 local thật

Đã apply migration 0001–0015 vào D1 local với persistence ở `/tmp/cashclaw-opc-e2e/persist`. Dùng hai user tổng hợp `@example.invalid`; đăng nhập qua `/api/auth/login`, cookie/session được tra trong D1. Không dùng fixture header làm danh tính.

| Kiểm tra | Kết quả quan sát |
|---|---|
| Không có session / session hết hạn | 401 |
| Tạo item hợp lệ | 201, owner là user từ session |
| Forged `x-user-id` | Bị bỏ qua; không đổi owner |
| User B list/read/PATCH item của A | Không thấy / 404 |
| Origin ngoài ứng dụng khi POST | 403 |
| Ngày lịch không hợp lệ | 400 |
| `open → in_progress → done` | 200, version tăng lần lượt 1, 2 |
| Chuyển trạng thái không hợp lệ | 409, không tạo transition |
| Gửi lại trạng thái hiện tại | 200, `unchanged` |
| History trong D1 | `created@0`, `open→in_progress@1`, `in_progress→done@2` |
| Dừng rồi khởi động lại Worker với cùng D1 | Login lại và đọc được item cùng đủ 3 events |
| Trang VI / EN qua HTTP | Cả hai 200 và nội dung đúng locale sau fix |

SQL kiểm tra xác nhận owner, trạng thái, version và event khớp. Các ID trong fixture là synthetic; E2E không dùng dữ liệu người dùng thật. Đây là HTTP E2E thực với local D1, không phải browser automation. Không có Chromium/Playwright, nên chưa xác nhận hydration/click flow bằng trình duyệt và không có screenshot.

## D. Năm bộ phận và giới hạn sản phẩm

- **Finance — PARTIAL/BLOCKED:** work item có amount nguyên theo minor currency units; không có double-entry ledger, chứng từ, đối soát, thuế hoặc billing reconciliation.
- **Operations — PARTIAL:** hàng đợi lưu bền, owner-scoped, có trạng thái/history; chưa có vendor/procurement/asset/SLA/automation hoàn chỉnh.
- **Marketing — BLOCKED:** không có consent/contact store, attribution, campaign automation; không gửi email/marketing.
- **Sales — BLOCKED:** không có CRM pipeline, customer accounts, quote/contract/order lifecycle.
- **Customer support — BLOCKED:** không có ticket SLA, customer identity, channel ingestion hoặc response tooling.

Không gọi work item là ERP/CRM/helpdesk/kế toán. `done` chỉ là hoàn tất công việc, không phải đã thu tiền hay hoàn tất nghiệp vụ tài chính.

## E. Research / backtest / paper — chỉ synthetic, không tuyên bố edge

- Chạy AlphaResearchPipeline E2E với dữ liệu tổng hợp: 12 bước; 194 derivative signals; Sharpe 0.0000; pipeline khuyến nghị `discard`. Không nâng cấp strategy.
- Chạy `runBacktest` qua `PaperExchange` trên 8 nến synthetic 1h, Volatility DCA: 2 simulated trades, net PnL mô phỏng +172.28, phí 4.18, 8 điểm equity, fee assumption 0.1% và slippage assumption 0.05%. Đây chỉ là kết quả minh họa trên fixture ngắn, không phải hiệu năng ngoài mẫu hay bằng chứng lợi nhuận.
- Bao kết quả với nguồn/commit/cost assumptions rồi ghi vào một bảng E2E tạm trong **D1 local** bằng Wrangler; đọc lại sau lần restart Worker, kiểm SHA-256 `fac0916943847d1d045fa3817c70b1214b3a4f0b91163a63622f0fa175aea13a`.
- Giới hạn: harness persistence này dùng một bảng local tạm, không chứng minh production `runBacktestAction → persistBacktestResultToD1 → replay` đã chạy end-to-end. Không gọi dữ liệu synthetic là market data hoặc kết quả này là paper trade trên sàn.

## F. Live, SaaS, tenancy và billing

- Runtime live vẫn **default-off**. Repo docs/ADR mô tả paper-only; `LiveExchange` hiện có guard/gate nhưng không có production-grade approver/revocation policy, bounded exposure/loss controls, durable idempotency, exchange reconciliation và audit-before-dispatch đủ để cho phép live. Không bật flag, không cấu hình credentials, không gửi lệnh.
- Không dùng tài khoản/sàn, keys hoặc data thật; không dùng payment provider. Không chứng nhận SaaS-ready.
- Operations hiện scoping theo **user**, chưa theo workspace. RBAC/granular roles, isolation nhiều workspace, entitlement/billing và payment webhook chưa được audit end-to-end với danh tính/payment thực. Không mock payment để tuyên bố billing production.
- Các nhận định về production ở đây là review code/docs; không truy cập production state.

## G. Kiểm tra, lệnh và giới hạn governance

| Lệnh/hoạt động | Exit/kết quả | Phạm vi / giới hạn |
|---|---|---|
| `npx vitest run src/app/api/ops/work-items/route.test.ts src/middleware.test.ts src/lib/auth/session-user.test.ts` | 0 — 48 tests PASS | Targeted API/session/middleware |
| `npm run type-check` | 0 — PASS | `tsc --noEmit` |
| `npm run lint` | 0 — PASS | ESLint `src/`, zero warnings; chạy trong quality gate sau refactor |
| `npm test -- --reporter=dot` | 0 — 726 files, 6,064 tests PASS | Full suite; log có warning/deprecation và một research test skip do cache không có |
| `npm run build:worker` | 0 — PASS | Next/OpenNext/Cloudflare Worker; build cuối sau commit. Next còn cảnh báo convention `middleware` → `proxy` deprecated |
| `npm run quality:gate` | 1 — PARTIAL | Type-check/lint và coverage test run hoàn tất; `npx knip` lỗi `RangeError: Array buffer allocation failed` khi Oxc parser yêu cầu buffer 6 GiB. Knip chưa được xác nhận xanh |
| `git diff --check` và staged diff check | 0 — PASS | Không phát hiện whitespace errors |
| OpenNext + Wrangler HTTP E2E | PASS theo bảng C | Chỉ D1 local; có TLS `Request.cf` warning trong sandbox nhưng worker khởi động/đáp ứng HTTP |
| Browser automation/screenshot | NOT RUN | Không có browser runtime trong môi trường |

## H. Artifact, trạng thái repo và việc cần mở khóa

- Working tree sạch sau commit; không push, không tạo PR.
- Patch: `cashclaw-ops-hardening.patch` — 55,860 bytes, SHA-256 `a8a8ed57983d220f374086fe0e8379b201a54de01347a4b78dc243c595219d89`. Đã `git apply --check` và apply trên bản sao sạch tại base; tree khớp commit.
- Git bundle: `cashclaw-trading-bot.bundle` — 12,815 bytes, SHA-256 `2d181e7978751395245ee136b84054fe1fd56b0b25f42681c9ba72787517d3e8`. Bundle incremental, cần base commit `11a774e820920dfbdb8e0ee52fe4599a69851770`; đã verify và fetch vào bản sao sạch ở base.
- `SHA256SUMS` và `manifest.txt` nằm cùng thư mục artifacts. Các artifact đã được tạo trong workspace; điều này không có nghĩa chúng đã được tải xuống máy người dùng.
- Bước tiếp theo: chủ dự án cần có browser runtime để chạy UI hydrated E2E/screenshot; sửa hoặc nâng môi trường Knip/Oxc để hoàn tất quality gate; audit/triển khai workspace membership + RBAC + entitlement/billing; hoàn thiện production live safety review chỉ khi có approval riêng. Không cần cấp quyền live trong tác vụ này.
- **Không thực hiện:** push/PR, deploy, remote D1 migration, real-money order/live mode, mở rộng quyền, marketing/outbound, payment/billing thật, truy cập/tiết lộ secrets.
