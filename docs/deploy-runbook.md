# Deploy Runbook — CashClaw Trade Bot

# Sổ Tay Triển Khai — CashClaw Trade Bot

---
<!-- Phase 1: Pre-deploy -->
## 1. Pre-Deploy Checks / Kiểm Tra Trước Triển Khai

### English

- [ ] **Build passes:** `npm run build`
- [ ] **Tests pass:** `npm test`
- [ ] **Type-check clean:** `npx tsc --noEmit` (or `npm run type-check`)
- [ ] **Lint clean:** `npm run lint`
- [ ] **Working tree clean:** `git status` shows no uncommitted changes for this change set
- [ ] **Env vars set in Cloudflare:** D1 binding, `ALLOWED_ORIGINS` var, `ADMIN_TOKEN` secret, `ENCRYPTION_KEY` secret (no KV binding — `CACHE` is declared optional in `src/lib/db/types.ts` but never read at runtime)
- [ ] **D1 exists:** `wrangler d1 migrations apply cashclaw-db --remote` (idempotent)
- [ ] **Secrets loaded:** `wrangler secret list` shows required keys

### Vietnamese

- [ ] **Build thành công:** `npm run build`
- [ ] **Tests pass:** `npm test`
- [ ] **Type-check sạch:** `npx tsc --noEmit` (hoặc `npm run type-check`)
- [ ] **Lint sạch:** `npm run lint`
- [ ] **Working tree sạch:** `git status` không có thay đổi chưa commit
- [ ] **Env vars đã set trên Cloudflare:** D1 binding, KV binding, API key của provider
- [ ] **D1 tồn tại:** `wrangler d1 migrations apply cashclaw-db --remote` (idempotent)
- [ ] **Secrets đã load:** `wrangler secret list` hiển thị các key bắt buộc

---
<!-- Phase 2: Deploy -->
## 2. Deploy Command / Lệnh Triển Khai

### English (Cloudflare Workers via OpenNext)

```
npm run deploy
```

This script injects `GIT_COMMIT_SHA` and `BUILD_TIMESTAMP` from the current commit, then runs `@opennextjs/cloudflare build` followed by `@opennextjs/cloudflare deploy`.

Expected output: `Deployed to https://<worker-name>.workers.dev`

### Vietnamese (Cloudflare Workers qua OpenNext)

```
npm run deploy
```

Script này tiêm `GIT_COMMIT_SHA` và `BUILD_TIMESTAMP` từ commit hiện tại, sau đó chạy `@opennextjs/cloudflare build` rồi `@opennextjs/cloudflare deploy`.

Output mong đợi: `Deployed to https://<worker-name>.workers.dev`

---
<!-- Phase 3: Post-deploy smoke test -->
## 3. Post-Deploy Smoke Test / Kiểm Tra Xông Nóng Sau Triển Khai

### English

1. 🌐 Hit health endpoint: `curl https://<worker-name>.workers.dev/api/health`
2. ✅ Expect JSON with `status: "ok"` and `checks.db === "ok"`
3. 🔑 Hit bot routes (e.g. waitlist): `curl -X POST .../api/waitlist -H "Content-Type: application/json" -d '{"email":"test@example.com"}'`
4. 📊 Check monitoring dashboard or Cloudflare Analytics for 200s
5. 👁 Watch logs: `wrangler tail` for 30–60 seconds for expected request volume

### Vietnamese

1. 🌐 Gọi health endpoint: `curl https://<worker-name>.workers.dev/api/health`
2. ✅ Mong đợi JSON có `status: "ok"` và `checks.db === "ok"`
3. 🔑 Gọi bot routes (ví dụ waitlist): `curl -X POST .../api/waitlist -H "Content-Type: application/json" -d '{"email":"test@example.com"}'`
4. 📊 Kiểm tra monitoring dashboard hoặc Cloudflare Analytics các request 200
5. 👁 Theo dõi logs: `wrangler tail` trong 30–60 giây để đảm bảo traffic ổn

---
<!-- Phase 4: Rollback -->
## 4. Rollback / Quay Lui

### English

```
npm run rollback:worker
```

This command:
1. Lists all deployed Worker versions via `wrangler versions list --json`
2. Selects the previous version (2nd in list)
3. Runs `wrangler rollback <version-id> --yes`

If there is no previous version (first deploy), the command will fail with "No previous version to rollback to." In that case, revert code, commit with message `fix: revert deploy <date>`, then re-deploy. If user traffic is impacted, pause new traffic first and escalate to Tech Lead.

### Vietnamese

```
npm run rollback:worker
```

Lưu ý: Route này là no-op nếu rollback chưa được cấu hình. Nếu vậy, revert code, commit với message `fix: revert deploy <date>`, rồi triển khai lại. Nếu traffic bị ảnh hưởng, tạm dừng traffic mới trước và escalate lên Tech Lead.

---
<!-- Phase 5: Emergency contacts and escalation -->
## 5. Emergency Contacts Placeholder / Liên Hệ Khẩn Cấp

### English

| Role | Contact | When to Call |
|------|---------|--------------|
| On-call Engineer | `[NAME]` | First responder |
| Tech Lead | `[NAME]` | Critical incidents, rollback decisions |
| DevOps / Infra | `[NAME]` | Cloudflare issues, D1 database problems |
| Product Owner | `[NAME]` | Business impact decisions |

### Vietnamese

| Vai Trò | Liên Hệ | Khi Nào Liên Hệ |
|---------|----------|------------------|
| On-call Engineer | `[TÊN]` | Người trực tiếp xử lý |
| Tech Lead | `[TÊN]` | Sự cố nghiêm trọng, quyết định rollback |
| DevOps / Infra | `[TÊN]` | Vấn đề Cloudflare, lỗi D1 database |
| Product Owner | `[TÊN]` | Quyết định tác động kinh doanh |

---
> **Last updated / Cập nhật lần cuối:** 2026-08-16