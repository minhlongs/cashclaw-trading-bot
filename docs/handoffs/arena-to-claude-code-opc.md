# Handoff: Arena Agent → Claude Code CLI (PR #35, approved-execution ops + durable scheduling)

> Tài liệu bàn giao. Ngày: 2026-11-02. Phạm vi: hoàn thiện Approval queue / durable scheduler /
> alert dispatch / outbound retry trong PR #35. **Không** bao gồm merge, deploy, migration remote,
> gửi tin thật, thanh toán thật, hay bật live trading.

---

## A. Danh tính phiên

- Repository: https://github.com/minhlongs/cashclaw-trading-bot
- PR: https://github.com/minhlongs/cashclaw-trading-bot/pull/35 (OPEN / **Draft** — giữ Draft)
- Branch làm việc: `arena/06ec4bf4-cashclaw-trading-bot` (base `main` @ `11a774e820920dfbdb8e0ee52fe4599a69851770`)
- Code commits của đợt này (HEAD cuối = commit chứa code):
  - `456ec6d` — (đợt trước) dọn export thừa knip
  - `374d339` — **Bound approved outbound_message retries and harden scheduler/alert semantics** (migration 0019, execution runner, senders hardening, E2E + receiver, evaluators)
- Commit chứa tài liệu handoff này: **commit riêng ngay sau `374d339`** (xem mục "Cam kết SHA" bên dưới).
- Đã push toàn bộ lên branch PR. Working tree sạch tại thời điểm bàn giao (trừ các file artifact timestamp do evaluator ghi lại).
- Sự cố workspace trong phiên: cloud snapshot restore về `11a774e` **5 lần**. Quy trình phục hồi đã dùng:
  1. Dừng mutation, `git status` + so sánh byte toàn bộ file dirty với `origin/arena/...` (`git cat-file blob`).
  2. Chứng minh 100% nội dung dirty giống remote (stale copy) — không có nội dung mới chưa push.
  3. Backup bundle: `/home/user/arena-backup-2026-11-02-pr35/` (77 file + manifest + tarball) + `git stash push -u`.
  4. Mới `git reset --hard origin/arena/06ec4bf4-cashclaw-trading-bot`. Khôi phục được hoàn toàn qua stash/bundle nếu cần.

### Cam kết SHA (tránh vòng lặp self-reference)

Tài liệu này **không** tự chứa SHA của commit chứa nó. Quy ước:
- "HEAD code" = `374d339` (verified: `git rev-parse 374d339` khớp remote).
- "HEAD tài liệu" = commit kế tiếp trên cùng branch (chạy `git log --oneline -1 -- docs/handoffs/arena-to-claude-code-opc.md` để biết).
- Mọi claim về checks phải tra cứu run links trong PR body (nguồn sự thật), không tin mô tả trong file này.

## B. Quyết định chủ dự án

1. **Mục tiêu OPC**: một người điều hành trading, tài chính, marketing, sales, support. Hai nguồn thu (thuê bao phần mềm + giao dịch vốn riêng) — **đo riêng, không gộp P&L**.
2. **Scope đợt này** (đã hoàn thành phần code): approval queue + audit; durable scheduler; alert dispatch + outbound_message execution có retry bounded; kiểm chứng; bàn giao.
3. **Quyết định mới (2026-11-02)**: sau phê duyệt, agent được **tự gửi outbound_message và retry trong hạn mức đã duyệt**; chủ dự án **chấp nhận tin nhắn trùng** (at-least-once). KHÔNG có: retry vô hạn, tự đổi nội dung/đích, tự mở rộng campaign, tự cấp ngân sách, tự bật provider/gửi thật trong phiên.
4. **Hạn mức retry mặc định do AGENT chọn cho môi trường thử nghiệm** — CHƯA phải phê duyệt production:
   - `maxAttempts = 3` (trần 10), `requestTimeoutMs = 10000` (100–60000),
   - `backoffBaseMs = 1000`, `backoffMaxMs = 60000` (backoff = min(base × 2^(attempt−1), max)),
   - `approvalTtlMs = 86400000` (24h; trần 7 ngày). Thiếu/không hợp lệ policy ⇒ **chặn execution**.
5. **Legacy entitlement policy** (không đổi): case-by-case audited restoration; fail-closed; không grace/auto-renew; chưa áp dụng production.
6. **Live trading mặc định tắt** — mọi kịch bản bật live cần phê duyệt riêng; không có lệnh thật/tiền thật nào được đặt.
7. **Không được phép** (vẫn còn hiệu lực): merge/undraft PR, deploy production, remote migration, gọi provider thật, gửi email/tin/webhook thật, payment/invoice thật, khôi phục entitlement thật, bật live, force-push, tiết lộ secrets.

## C. Bản đồ thay đổi

### Schema / migrations (thứ tự: 0001..0019; 0018 giữ nguyên vẹn byte)

| File | Nội dung |
|---|---|
| `migrations/0018_ops_approval_durable_scheduling.sql` | (đợt trước) approval lifecycle + `ops_approval_events` (append-only, trigger CAS) + `saas_bot_tick_leases` + `saas_alert_dispatch_log` |
| `migrations/0019_ops_action_retry_policy.sql` | **Mới.** Policy columns trên `ops_work_items` (max_attempts, request_timeout_ms, backoff_base_ms, backoff_max_ms, approval_ttl_ms, approval_expires_at_ms, approved_sha256, approved_target, next_attempt_at_ms, revoked_at_ms); `ops_action_attempts` (UNIQUE(item_id, attempt_no), trigger bất biến claim + append-only); thay trigger 0018 bằng bản mở rộng (approve BẮT BUỘC snapshot hash+target; execute BẮT BUỘC snapshot tồn tại + không revoke; thêm nhánh `revoked`) |

- Upgrade: additive; approval cũ thiếu snapshot ⇒ fail-closed tới khi duyệt lại (không auto-grant). Writer drain trước migration theo runbook cũ.
- **Không sửa migration đã commit** — mọi thay đổi schema tiếp theo = migration 0020+.

### State machine (3 khái niệm tách bạch — đừng gộp)

1. **Approval lifecycle** (`approval_state`): `none → draft → pending_approval → approved | rejected`; `approved → revoked`. Machine: `src/app/api/ops/work-items/approval-machine.ts`.
2. **Execution attempts** (`ops_action_attempts`): INSERT claim = tiêu thụ attempt NGUYÊN TỬ trước side effect; `attempt_no` UNIQUE; claim bất biến; outcome ghi đúng 1 lần từ `in_flight`.
3. **Delivery outcome** (`attempts.outcome` + tóm tắt `execution_state`): `provider_accepted` (= `executed`; **provider chấp nhận, KHÔNG phải người nhận đã đọc**) | `failed_retryable` | `failed_terminal` (cấu hình/auth/input — không auto-retry) | `unknown` (timeout sau khi request có thể đã tới nơi — ambiguous; retryable theo quyết định chấp nhận trùng) | `discarded` (mất quyền giữa claim và gửi — không có side effect).

### Retry semantics

- Mỗi lần gửi tiêu thụ 1 attempt (claim INSERT) trước mọi tác động ngoài; hai worker không cùng claim được 1 attempt (UNIQUE).
- Retry chỉ khi: còn budget (`attempt_count < maxAttempts`), outcome retryable, `next_attempt_at_ms` đã tới (backoff bounded; tôn trọng `Retry-After` ≤ backoffMax), approval còn hiệu lực + snapshot khớp.
- Hết hạn (`approval_expires_at_ms <= now`) ⇒ chặn; revoke ⇒ chặn vĩnh viễn; restart không reset counter (lịch sử attempts trong D1).
- Timeout sau khi request có thể đã rời client ⇒ `unknown` (không bao giờ ghi là thành công).
- Auto-retry qua cron: `CASHCLAW_OPS_AUTORETRY_ENABLED=true` + DB binding; **không** backfill tick đã lỡ; chỉ `outbound_message` đã duyệt.
- Idempotency: email adapter gửi `Idempotency-Key = eventId` (ổn định qua các lần retry); **không tuyên bố exactly-once** — at-least-once theo quyết định chủ dự án.

### Scheduler lease / fencing

- `saas_bot_tick_leases`: 1 lease / workspace / bot / phút (PK) — election nguyên tử; takeover chỉ khi lease hết hạn (guarded UPDATE, đúng 1 row qua RETURNING).
- **Fencing của result-write CHƯA được implement** cho bot job drain — lease chỉ là entry guard (ghi nhận giới hạn, còn lại trong mục F).
- Memory fallback chỉ khi `CASHCLAW_ALLOW_MEMORY_LEASE=true` (test mode, single-isolate); production path dừng rõ ràng khi thiếu DB (log error + skip).
- Clock: `nowMs` truyền tường minh (event.scheduledTime / Date.now()); không trộn nguồn.
- Retention: `cleanupSchedulerState` xóa lease hết hạn >24h và dispatch log `sent/suppressed` >30 ngày; **attempts + audit không bao giờ bị xóa**.

### Provider result semantics

- `delivered` (tên cũ, deprecated) ≡ `providerAccepted` ≡ HTTP 2xx từ provider — **không** chứng minh người nhận. Trường canonical: `providerAccepted`; response alerts route kèm `deliverySemantics: 'provider_accepted_not_end_user_delivery'`.
- Webhook target: validate SSRF (https bắt buộc; http chỉ loopback khi `CASHCLAW_WEBHOOK_ALLOW_LOOPBACK=true` — cờ cấu hình server cho test harness, không phải input caller; chặn private/link-local/metadata IP, không credentials trong URL, không theo redirect).

### Auth / tenant boundary

- Toàn bộ `/api/ops/work-items*` + `/approvals` dùng `requireOperationsUser` (session server-side); owner-scoped (`owner_user_id = session user`) — user khác không đọc/duyệt/execute được (có test).
- Không tin caller-supplied user/role/tier/workspace (CreateSchema `.strict()` từ chối field lạ; approval state không set được từ client — draft-only khi tạo action).
- CSRF/origin: nhất quán với middleware origin-check hiện có của app (không thêm cơ chế mới).

### Dependency / compatibility

- `action-execution.ts` (thuần + SQL) ← `action-execution-runner.ts` (trình tự claim→send→persist) ← route approvals + cron drain.
- `approved-snapshot.ts`: hash SHA-256 canonical JSON (WebCrypto) — chỉ là kiểm tra tính nhất quán, không phải bằng chứng nghiệp vụ.
- UI chỉ render panel phê duyệt cho **action items**; item thường giữ nguyên DOM (4 browser regression cũ không đổi).
- Response alerts route: additive (`providerAccepted`, `deliverySemantics`); `delivered` giữ nguyên nghĩa đã ghi.

## D. Cách tái hiện

```bash
# Runtime theo lockfile: Node 22, npm (package-lock.json). Tuyệt đối không đổi lockfile tùy tiện.
cd <repo>            # ví dụ /Users/macbook/trade-bot — TỰ XÁC MINH đường dẫn thực tế
npm ci

# D1 local cô lập + seed user tổng hợp (passcode test nằm trong script, không commit secrets thật):
node scripts/verification/pr35-worker-d1-setup.mjs --reset     # tạo .wrangler/pr35-local.jsonc + dev.vars + D1

# Worker local (OpenNext build + wrangler dev, cổng 8787):
npm run build:worker
npx wrangler dev --local --ip 127.0.0.1 --port 8787 --persist-to .wrangler/verification/pr35-d1-worker --config .wrangler/pr35-local.jsonc

# Tests/evaluators (mỗi lệnh phải exit 0):
npm test                                  # 736 files / 6134 tests
npm run test:coverage                     # thresholds 90/90/94/90
npm run type-check && npm run lint        # tsc + eslint --max-warnings 0
node scripts/verification/pr35-migration-0016-legacy-eval.mjs --reset
node scripts/verification/pr35-legacy-recovery-eval.mjs --reset      # 24 stages
node scripts/verification/pr35-ops-scheduling-eval.mjs --reset       # 8 stages
node scripts/verification/pr35-ops-execution-eval.mjs --reset        # 8 stages

# Browser E2E đầy đủ (tự build + seed + fake receiver + 2 phase, artifacts đã scrub):
node scripts/verification/pr35-browser-e2e.mjs
# Phase 1 kỳ vọng 8 tests pass (3 regression ops + 5 approval), phase 2 kỳ vọng 2 @restart, 0 skip.

# Artifacts: .wrangler/verification/pr35-browser-artifacts/ (screenshots, traces scrubbed, manifest)
# Biến env test-harness (do harness tự ghi vào dev.vars, KHÔNG phải secrets):
#   CASHCLAW_ALERT_WEBHOOK_TARGET_URL, CASHCLAW_WEBHOOK_ALLOW_LOOPBACK, CASHCLAW_OPS_AUTORETRY_ENABLED,
#   CASHCLAW_ALLOW_MEMORY_LEASE. Biến cấu hình thật (giá trị ở production secrets, không commit):
#   CASHCLAW_TELEGRAM_BOT_TOKEN, CASHCLAW_TELEGRAM_CHAT_ID, CASHCLAW_EMAIL_API_URL,
#   CASHCLAW_EMAIL_API_KEY, CASHCLAW_EMAIL_FROM, CASHCLAW_EMAIL_TO, CASHCLAW_ALERT_WEBHOOK_SECRET.
# Cleanup dữ liệu tạm: rm -rf .wrangler/verification/pr35-* .wrangler/pr35-*.jsonc
```

Fake receiver (test only): `scripts/verification/pr35-fake-receiver.mjs` — modes `ok | fail500 | hang | drop`,
counters độc lập tại `GET /__state` (so sánh request thực tới nơi vs attempts ghi trong DB).

## E. Bằng chứng

- Local (sandbox Arena, Node 22): `npm test` 736/6134 PASS; `test:coverage` exit 0; `type-check` 0 lỗi;
  `lint --max-warnings 0` sạch; 4 evaluator PASS (0016: 1 stage, recovery: 24, scheduling: 8, execution: 8).
- **Browser E2E CHƯA chạy được trong sandbox Arena** (Chromium không tải được — host download bị chặn).
  Bộ 5 test mới (`tests/e2e/pr35-approval-actions.spec.ts`) + fake receiver + harness counts (8/2) được
  xác minh bởi **hosted CI** trên head cuối — xem run links trong PR body. Nếu hosted fail ở browser job,
  sửa theo record log cụ thể trong artifact (không nới assertion, không skip).
- CI hosted trên `374d339`: xem "Current head and hosted checks" trong PR body (nguồn sự thật).
  Trước đó: `456ec6d` all-green (runs 41195577896/41195577898) — CI + evaluators + browser + governance.
- Artifacts: **chưa xem nội dung** (blob host chặn tải từ sandbox). Links mới nhất ở PR body.
- Khác biệt local/hosted: browser suite chỉ hosted; mọi thứ khác chạy cả hai nơi.

## F. Công việc còn lại (cho Claude Code CLI)

| # | Ưu tiên | Việc | File/flow | Bằng chứng hiện tại | Tiêu chí hoàn thành | Local/ quyền ngoài | Blocker |
|---|---|---|---|---|---|---|---|
| 1 | Cao | Xác minh hosted CI trên head cuối; sửa browser E2E nếu fail | `tests/e2e/pr35-approval-actions.spec.ts`, `scripts/verification/pr35-browser-e2e.mjs` | 5 test mới chưa chạy browser thật | CI browser job xanh (8 phase1 + 2 phase2, 0 skip) | Cần GitHub Actions (quyền ngoài) | Chromium không chạy được trong sandbox |
| 2 | Cao | Owner review artifact browser + duyệt policy retry production (giá trị hiện là test defaults) | PR body links; mục B.4 | Defaults agent-chốt | Owner xác nhận/điều chỉnh maxAttempts/TTL/backoff cho production | Quyền owner | Chưa có quyết định production |
| 3 | Trung bình | Fencing token cho bot job result-write (hiện lease chỉ entry-guard) | `src/ee/scheduler/tick-lease-store.ts`, `src/tree/bot/**` | Docs ghi rõ giới hạn | Kết quả ghi kèm lease token bị từ chối khi lease đã bị takeover | Local được | Chạm vào bot runtime — cần scope riêng |
| 4 | Trung bình | Per-workspace đích nhận thông báo + isolation tương ứng | `src/ee/alerts/alert-channel-senders.ts`, env-based target | Hiện 1 đích operator (đúng mô hình 1 người) | Khi có >1 tenant thật: per-workspace target + test isolation | Local được | YAGNI tới khi có khách thật |
| 5 | Thấp | Idempotency thật từ provider (nếu provider hỗ trợ) | email/webhook adapters | Gửi `Idempotency-Key`; không claim exactly-once | Provider xác nhận dedupe | Quỳa quyền provider | Không có provider thật nào cấu hình |
| 6 | Thấp | Thu hồi/dọn `ops_action_attempts` theo retention (hiện giữ vĩnh viễn — đúng yêu cầu audit) | `cleanupSchedulerState` | Cleanup chỉ xóa lease/dispatch tạm | Chính sách retention duyệt riêng | Local được | Cần quyết định chủ dự án |
| 7 | Sau merge | Rollout production theo runbook: backup → restore drill → preflight → drain → migrate 0015..0019 → post-checks | `docs/verification/pr35-legacy-recovery-runbook.md` | Eval local xanh | Owner-run xong | **Quyền owner; không tự làm** | Không được phép trong phiên |

## G. Hướng dẫn an toàn cho Claude Code CLI

1. **Trước mọi mutation**: `git status`, `git branch --show-current`, `git rev-parse HEAD` — chỉ làm việc trên `arena/06ec4bf4-cashclaw-trading-bot`; không checkout/reset `main`; không rebase/force-push.
2. **Bảo toàn concurrent work**: nếu thấy worktree dirty bất thường (snapshot restore), so sánh từng file với remote trước khi đụng; backup ra ngoài repo trước khi reset; không `reset --hard` khi chưa chứng minh nội dung là stale.
3. **Không áp lại patch cũ / không re-run artifact đã có**; đọc code + evidence thật.
4. Đọc `AGENTS.md`, `.claude/CLAUDE.md` và tài liệu này trước khi làm.
5. **Không tin báo cáo Arena là bằng chứng đã tự kiểm chứng** — chạy lại evaluator/test ở mục D và tự đọc output.
6. **Không tự**: merge/undraft PR, deploy, remote migration, gửi email/tin/webhook thật, payment, khôi phục entitlement thật, bật live trading, đặt lệnh thật, tiết lộ secrets.
7. Verify đúng HEAD (`git rev-parse HEAD` khớp mục A) trước khi kết luận bất kỳ điều gì.
8. Báo cáo cuối bằng **tiếng Việt**; nêu rõ cái gì đã tự kiểm chứng, cái gì còn chờ quyền ngoài.
9. Giữ PR **Draft** cho tới khi chủ dự án chủ động yêu cầu khác.

---
*Hết tài liệu bàn giao.*
