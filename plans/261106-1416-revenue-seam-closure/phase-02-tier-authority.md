---
title: "Phase 02 — Tier Authority (bỏ header bypass)"
description: "Bỏ x-cashclaw-tier và ?tier= khỏi đường quyết định tier production. Tier chỉ đến từ D1 entitlement của workspace. Rủi ro cao nhất trong plan."
status: done
verified: "2026-11-06 — npm run quality:gate exit 0; 4 đường tự khai đã đóng (grep explicitTier/invalidExplicitTier = 0); x-cashclaw-tier/chỉ không còn chỗ đọc"
risk: high
owner: executor
dependsOn: [phase-01-baseline-and-tree-flush]
---

# Phase 02 — Tier Authority

## Context

Đây là **rủi ro cao nhất** trong toàn plan và phải làm **trước** khi build checkout. Lý do:
nếu build checkout trước, bạn đang gắn bề mặt thu tiền lên một hệ thống quyền lợi mà bất
kỳ ai cũng tự cấp được — lúc đó khách trả $29 cho thứ họ lấy miễn phí bằng một `curl`.

Hành vi hiện tại, `src/ee/tenancy/workspace-request-context.ts:29-57`:

```
line 34  queryTier = url.searchParams.get('tier');
line 44  rawHeaderTier = req.headers.get('x-cashclaw-tier')
line 45  candidateTier = rawExplicitTier || rawHeaderTier
line 47  if (candidateTier) { ... return { tier: parsed.data } }   ← thắng D1
line 53  tier = workspaceId ? store.getWorkspaceTier(workspaceId) : 'BASIC'
```

Thứ bậc: **explicit/query/header tier > D1 entitlement store**. Nên
`curl -H 'x-cashclaw-tier: MASTER' /api/ee/quotas` trả `MASTER`.

**Phát hiện bổ sung (đã đo 2026-11-06) — tier tự khai qua `explicitTier` của 2 route.**
Resolver có tham số thứ hai `options.explicitTier`, và **hai route production truyền tier
từ input của chính request vào đó** — tức là tier còn tự khai được qua "cửa sau" ngay cả
khi bỏ header và query:

| Route | Nguồn `explicitTier` | Dòng |
|---|---|---|
| `src/app/api/ee/alerts/route.ts` | `parsed.data.tier` — **body** của request | `route.ts:22` khai `tier` trong schema, `route.ts:40` truyền vào resolver |
| `src/app/api/ee/credits/route.ts` | `url.searchParams.get('tier')` — **query** | `credits/route.ts:27,33` |

Nếu phase này chỉ bỏ đọc header/query **bên trong** resolver mà không sửa hai call site
trên, `POST /api/ee/alerts` với body `{"workspaceId":"w","tier":"MASTER",...}` vẫn lấy
được entitlement MASTER. Đây là cùng một lỗ hổng, chỉ khác cửa vào. **Hai call site phải
ngừng truyền tier tự khai vào resolver** — `alerts` bỏ `tier` khỏi schema (hoặc không còn
truyền `explicitTier`), `credits` bỏ query `tier`.

**Đã xác minh an toàn chống người ngoài:** `grep x-cashclaw-tier` trên toàn `src/` cho
thấy **chỉ có `resolveWorkspaceTierContext` đọc header này**. Không client production nào
gửi nó. `src/app/api/ee/sync/route.ts` (CLI sync bridge) gọi
`resolveWorkspaceTierContext(req)` mà không set header tier → nó rơi vào nhánh D1 store
(line 53). **Nên đóng đường bypass không làm hỏng CLI sync hay bất cứ caller thật nào.**

## Requirements

1. Trong production, tier chỉ đến từ `defaultSaasEntitlementStore` (D1).
2. `workspaceId` vẫn suy ra được từ `?workspaceId=` / `x-cashclaw-workspace` (phase-03 sẽ
   thêm nguồn từ session).
3. `invalidExplicitTier` vẫn được trả ra để chặn input rác **nhưng không còn được dùng để
   cấp tier**.
4. Test/mock vẫn cần cách ép tier **tường minh, không qua HTTP header**.

## Files

| File | Quyền | Ghi chú |
|---|---|---|
| `src/ee/tenancy/workspace-request-context.ts` | sửa | Xoá nhánh tier từ request; xem bước 6 về `x-cashclaw-active-bots` |
| `src/app/api/ee/alerts/route.ts` | sửa | Bỏ truyền `explicitTier` từ body; bỏ `tier` khỏi schema |
| `src/app/api/ee/credits/route.ts` | sửa | Bỏ truyền `explicitTier` từ query `?tier=` |
| `src/ee/__tests__/workspace-request-context.test.ts` | viết lại | Pin hành vi mới |
| `src/ee/__tests__/runtime-seams-e2e.test.ts` | viết lại | Bỏ set tier qua header |
| `src/app/api/ee/__tests__/ee-routes.test.ts` | viết lại | Idem |
| `src/app/api/ee/__tests__/expanded-routes.test.ts` | viết lại | Idem |

## Steps

1. **Lược bỏ việc đọc tier từ HTTP** trong `resolveWorkspaceTierContext`. Giữ lại phần
   `workspaceId` (query `workspaceId`, header `x-cashclaw-workspace`,
   `options.explicitWorkspaceId`) — phần này phase-03 cần.
2. **Giữ `invalidExplicitTier` cho trường hợp test tường minh** nếu test cần chặn giá trị
   rác, nhưng **không** dùng nó để quyết định tier. Nếu không còn caller nào dùng, xoá
   khỏi `WorkspaceTierContext` và cập nhật các route đang đọc nó (`sync/route.ts`,
   `credits/route.ts`, `quotas/route.ts`, `alpha-feed/route.ts` — **đừng xoá route**, chỉ
   xoá nhánh kiểm tra field).
3. **Cho test một cách ép tier không qua HTTP.** Nếu test cần tier không-BASIC, chỉ trực
   tiếp vào `defaultSaasEntitlementStore.recordIpnAndUpgradeTier(...)` để seed workspace đó.
   Đây là hành vi production thật (IPN nâng tier), nên test vẫn mô phỏng đúng vòng đời.
4. **Viết lại test chốt chặn bằng chứng cũ thành chốt chặn mới.** Test hiện tại
   (`workspace-request-context.test.ts:35-42`) chỉ chốt tier *rác* bị chặn. Thêm test mới
   rõ ràng:
   ```
   it('ignores a self-declared tier header and returns the D1 tier', ...)
     // seed workspace tg_01 = PREMIUM qua recordIpnAndUpgradeTier
     // GET với header x-cashclaw-tier: MASTER  → expect tier === 'PREMIUM'
   it('ignores a self-declared tier query parameter', ...)
     // GET /api/ee/quotas?workspaceId=tg_01&tier=MASTER → expect 'PREMIUM'
   it('falls back to BASIC for an unknown workspace', ...)
   ```
   **Không làm yếu**: không xoá assertion, chỉ đổi thứ bậc được khẳng định.

   Thêm hai case cho hai cửa sau vừa phát hiện — đây mới là phần dễ quên nhất:
   ```
   it('ignores a self-declared tier in the POST body of /api/ee/alerts', ...)
     // body { workspaceId: 'tg_01', tier: 'MASTER', channel: 'WEBHOOK', ... }
     // expect response.tier === 'PREMIUM' (tier D1 của tg_01), KHÔNG 'MASTER'
   it('ignores a self-declared tier query on /api/ee/credits', ...)
     // GET /api/ee/credits?workspaceId=tg_01&tier=MASTER → expect account.tier === 'PREMIUM'
   ```
   Nếu `tier` đã bị bỏ khỏi schema của `alerts`, case đầu tiên chốt việc schema **từ chối**
   field lạ (hoặc bỏ qua nó) — chọn **một** hành vi cố định và ghi rõ trong test, không để
   Zod `.passthrough()` âm thầm cho qua.
5. Chạy gate thu hẹp trước, mở rộng sau:
   ```bash
   npx vitest run src/ee/__tests__/workspace-request-context.test.ts
   npx vitest run src/ee/__tests__ src/app/api/ee/__tests__
   npm run quality:gate
   ```

6. **Phát hiện thứ ba — `x-cashclaw-active-bots` cũng tự khai được.**
   `resolveActiveBotCount` (cùng file, line 63-72) đọc `x-cashclaw-active-bots` từ request
   **trước** khi gọi loader. Điều này cho client khai "tôi đang chạy 0 bot" để luôn qua
   quota: `enforceWorkspaceQuota` chặn khi `activeRunningBots >= maxRunningPaperBots`, nên
   khai 0 là vượt mọi giới hạn số bot của tier.
   **Đã xác minh:** `grep x-cashclaw-active-bots` → **chỉ 2 chỗ trong production** (resolver
   đọc, và comment). Không client production nào set nó. Cả 2 caller đều đã truyền
   `botListHandler` (`api/bots/route.ts:75`, `ee/sync/route.ts:22`) — nên loader là nguồn
   dự định, header chỉ là shortcut cho test.
   **Xử lý trong phase này:** bỏ nhánh đọc header khỏi đường production; giữ loader làm
   nguồn duy nhất. Test hiện tại (`workspace-request-context.test.ts:63-72`,
   `runtime-seams-e2e.test.ts:133,142`) viết lại để truyền loader một cách tường minh,
   **không** xoá assertion. Nếu có nhu cầu giữ khả năng override cho CLI nội bộ, chỉ làm qua
   một header **riêng, do worker set** (kiểu `x-user-id` ở phase-03), không phải header
   client gửi được.
   Nếu phase quyết định để header lại (khuyến nghị: **không**), phải ghi rõ lý do trong
   report phase-07 dưới mục "rủi ro còn lại".

## Validation

```bash
# Sau khi chạy local worker (npm run preview hoặc wrangler dev):
curl -s "http://localhost:8787/api/ee/quotas?workspaceId=ws_known_premium"
curl -s -H "x-cashclaw-tier: MASTER" "http://localhost:8787/api/ee/quotas?workspaceId=ws_known_premium"
curl -s "http://localhost:8787/api/ee/quotas?workspaceId=ws_known_premium&tier=MASTER"
```
Cả ba phải trả `"tier":"<tier D1 thật của ws_known_premium>"`, không bao giờ `"MASTER"` chỉ
vì header/query. Với workspace lạ → `"tier":"BASIC"`.

Kiểm chứng thêm hai cửa sau (quan trọng ngang ba dòng trên):
```bash
curl -s -X POST http://localhost:8787/api/ee/alerts \
  -H 'content-type: application/json' \
  -d '{"eventId":"e1","workspaceId":"ws_known_premium","botId":"b1","channel":"TELEGRAM","message":"m","timestampMs":1700000000000,"tier":"MASTER"}'
curl -s "http://localhost:8787/api/ee/credits?workspaceId=ws_known_premium&tier=MASTER"
```
Không response nào được mang tier `MASTER` từ input của request.

Ngoài ra:
- `npx tsc --noEmit` → 0 error (kiểm tra kỹ các route vẫn compile sau khi bỏ
  `invalidExplicitTier`).
- `npx knip` → 0 issue (export/unused sau khi đổi type).
- `npx vitest run` → toàn bộ xanh, 0 test bị skip để qua ải.

## Risk & Rollback

**Rủi ro chính — đóng chưa đủ cửa.** Phase này có **ba** đường tự khai, không một:
header `x-cashclaw-tier`, query `?tier=` (cả hai bên trong resolver), và
`options.explicitTier` do chính route nạp từ body (`alerts`) hoặc query (`credits`). Cộng
thêm `x-cashclaw-active-bots` cho phép khai số bot để qua quota. Nếu chỉ sửa bên trong
resolver mà quên 2 call site, **bypass vẫn còn nguyên** và test xanh vẫn không phát hiện
được — chính kiểu mù mà suite hiện tại đang mắc với `workspace_id`/`target_tier`.
Giảm thiểu: 4 test case trong bước 4 (1 header + 1 query + 2 call site) và 4 dòng `curl`
trong Validation buộc phải chạy **trước** khi gọi phase này xong.

**Rủi ro thứ hai:** phá vỡ CLI sync (`/api/ee/sync`) nếu CLI có gửi `x-cashclaw-tier` hoặc
`x-cashclaw-active-bots` — đã xác minh là **không** (grep chỉ thấy resolver đọc). Nếu sau
này phát hiện CLI nào gửi, tier của CLI đó sẽ rơi về D1 store, có thể thấp hơn khả năng
thật — nhưng đó là hành vi **đúng** (không còn tự cấp).

**Rollback:** `git revert` riêng phase này. Vì đây là phase đầu thay đổi hành vi, revert là
sạch và không kéo theo phase khác.

**Dấu hiệu đi ngược lại:** nếu một caller external (thiệt bị khách tự chạy) thực sự dựa
vào `?tier=` để xem tier của chính nó — đổi tier đó sẽ làm caller đó mất quyền lọc trên
response. Cách xử lý đúng là caller đó đọc `response.tier`, không phải tự khai.
