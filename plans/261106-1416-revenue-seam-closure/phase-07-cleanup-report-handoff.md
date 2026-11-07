---
title: "Phase 07 — Cleanup, Report & Handoff"
description: "Dọn 7 branch remote stale, untracked packet, worktree; viết report đóng plan và giao cho executor tiếp theo."
status: done
risk: low
owner: executor
dependsOn: [phase-06-sandbox-e2e-verification]
---

# Phase 07 — Cleanup, Report & Handoff

## Context

Phase này làm **sau cùng**, không phải trước. Lý do: nếu dọn branch/worktree trước trong lúc
còn nhiều điều treo, bạn có thể mất tham chiếu trong lúc đang sửa.

Đo được hiện tại (session 2026-11-06):
- Remote stale: `origin/feat/alpha-research-os-phase7..10`, `origin/baseline/wave10-consolidation`,
  `origin/feat/comprehensive-4phase-roadmap`.
- Local: `baseline/wave10-consolidation`, `feat/cmo-gtm-landing-overhaul` (worktree này
  **đang được dùng** bởi `comprehensive-4phase-roadmap`).
- 1 untracked: `plans/reports/advise-261025-2343-comprehensive-roadmap-packet.md`.

## Requirements

1. `git status --short` sạch; `git worktree list` chỉ còn worktree đang hoạt động.
2. Branch remote stale được xoá **có chủ đích**, không vô tình xoá branch người khác đang dùng.
3. Report tồn tại trong `plans/reports/` ghi kết quả 7 evidence và các điểm chưa xác minh.
4. Journal entry được ghi (trừ khi bị tắt).

## Files

| File | Quyền |
|---|---|
| `plans/reports/ship-261106-1416-revenue-seam-closure.md` | tạo mới |

## Steps

1. **Kiểm tra tiến trình trước khi gỡ worktree** (theo rule process-management):
   ```bash
   ps aux | grep -E "[t]rade-bot-worktrees" | head
   lsof -i :8787 2>/dev/null | head
   ```
   Không có tiến trình mới gỡ.
2. **Rà soát branch trước khi xoá.** Với mỗi branch định xoá:
   ```bash
   git log origin/main..origin/feat/alpha-research-os-phase7 --oneline
   git branch -r --merged origin/main | grep <branch>
   ```
   Chỉ xoá khi **không có commit nào** nằm ngoài `origin/main`. Nếu branch n-a được merge
   (in danh sách `--merged`), `git push origin --delete` là an toàn.
   **Không** dùng pattern `pkill` rộng; đừng đụng branch `main`, `feat/cmo-gtm-landing-overhaul`
   (worktree đang dùng), hoặc branch của người khác.
3. **Xoá worktree không còn dùng** nếu phase-01 cho thấy nó đã xong; `git worktree prune`.
4. **Xử lý untracked packet**: chuyển vào `plans/261106-1416-revenue-seam-closure/` (nếu
   phase-01 chưa làm), **không xoá**.
5. **Viết report** `ship-261106-1416-revenue-seam-closure.md`, gồm:
   - Bảng 7 evidence: lệnh, kết quả thật, pass/fail.
   - Diff tổng hợp: file nào đổi, file nào mới, bao nhiêu LOC.
   - Các blocker của user còn treo (API key, callback URL, NOWPayments policy).
   - Những gì **không** làm được và vì sao.
   - Success metrics đo được: tier bypass 0 lần lọt, invoice tạo được, idempotency đúng,
     fail-closed xác nhận, quota 403 đúng tier, 2 user khác tier, gate exit 0.
   - **Mục "Ngoài phạm vi, cần user quyết"**: ghi rõ
     `src/app/api/ee/alerts/route.ts:70` có fallback `'default_alert_secret'` — cùng lớp
     lỗ hổng với `test_ipn_secret`, đã phát hiện và **cố ý không sửa** vì ngoài 6 requirement
     đã xác nhận. Đề xuất một phase riêng nếu user muốn đóng.
   - **Danh sách workspace mồ côi sau backfill phase-03**: chạy
     `SELECT workspace_id FROM saas_workspace_entitlements WHERE owner_user_id = 'system'`
     và ghi **từng** `workspace_id` vào report. Đây là dữ liệu thuộc về user — chủ sở hữu
     thật chỉ có thể neo tay, plan **không** tự đoán. Các workspace này không đọc được từ
     session sau phase-03.
6. **Journal**: chạy `/ak-journal`. Kiểm tra opt-out theo quy ước skill
   (`--skip-journal` hoặc `ak config prefs resolve --json | jq -r .prefs.journal.auto`).
   Nếu tắt, in một dòng ghi rõ.

## Validation

```bash
git status --short --branch        # → "## main...origin/main", không ahead/behind/untracked
git worktree list                  # → chỉ worktree đang hoạt động
git branch -r --no-merged origin/main   # → chỉ còn branch có chủ đích
ls plans/reports/ship-261106-1416-revenue-seam-closure.md  # tồn tại
npm run quality:gate; echo "EXIT=$?"   # → EXIT=0
```

## Risk & Rollback

**Rủi ro chính:** xoá nhầm branch còn giá trị. Giảm thiểu bằng bước 2 (kiểm tra
`git log origin/main..<branch>` trước mỗi lần xoá). Nếu xoá nhầm local, khôi phục được từ
reflog (`git reflog` / `git branch <name> <sha>`); nếu xoá nhầm remote, cần ai đó còn bản
local để push lại — đây là lý do chỉ xoá branch đã nằm trong `--merged origin/main`.

**Rollback:** không cần — phase chỉ dọn và ghi. Nếu xoá nhầm, tạo lại branch từ SHA đã ghi.

## Verified (đo 2026-11-07, sau khi phase-07 xong)

- **Kiểm tra tiến trình mồ côi:** `ps aux | grep -E "[t]rade-bot-worktrees"` → 0 tiến trình;
  `lsof -i :8787` → rỗng (`PORT_8787_FREE`).
- **Dọn branch đã merge có kiểm chứng (`0` commit ngoài `origin/main`):**
  - Đã xoá 1 branch local đã merge: `baseline/wave10-consolidation` (`5a8d5dd`).
  - Đã xoá 5 branch remote đã merge vào `origin/main`:
    - `origin/feat/alpha-research-os-phase7` (`12584c64`)
    - `origin/feat/alpha-research-os-phase8` (`50345497`)
    - `origin/feat/alpha-research-os-phase9` (`401cff1e`)
    - `origin/feat/alpha-research-os-phase10` (`57a62821`)
    - `origin/baseline/wave10-consolidation` (`5a8d5ddd`)
  - **Giữ nguyên** các branch còn commit chưa merge vào `origin/main`:
    `origin/feat/comprehensive-4phase-roadmap` (1 commit `dbe977c0`),
    `origin/feat/cmo-gtm-landing-overhaul` (1 commit `88847525`, gắn worktree đang tồn tại),
    `origin/arena/06ec4bf4-cashclaw-trading-bot` (42 commits `8453915b`).
- **Untracked packet:** `advise-261025-2343-comprehensive-roadmap-packet.md` đã nằm trong
  `plans/261106-1416-revenue-seam-closure/`.
- **Workspace mồ côi (`owner_user_id = 'system'`):**
  - Local D1: `0` dòng (`results: []`).
  - Remote D1 (`--remote`): bảng `saas_workspace_entitlements` chưa tồn tại (remote D1 mới ở
    migration `0012`; cần chạy `0013`..`0016` khi user xác nhận deploy).
- **Reports đã ghi:**
  - `plans/reports/verify-261106-1416-revenue-seam-closure.md`
  - `plans/reports/ship-261106-1416-revenue-seam-closure.md`
