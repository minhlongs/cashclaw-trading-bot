---
title: "Phase 01 — Baseline & Tree Flush"
description: "Kéo origin/main về, ghi baseline gate, xử lý stash cũ và untracked packet trước khi bất kỳ thay đổi hành vi nào."
status: done
risk: low
owner: executor
dependsOn: []
---

# Phase 01 — Baseline & Tree Flush

## Context

Mọi đo lường sau đây (test count, LOC ceiling, gate status) vô nghĩa nếu đo trên cây lệch
remote. Ngoài ra có hai mục chưa dọn làm nhiễu:

- `main` đang **behind 5** so với `origin/main` (đo lại 2026-11-06 sau `git fetch`):
  `11a774e8` (merge PR #34), `f11e29d` (ops workflows + live safety guards),
  `7df2d7d` (PR #33 CMO GTM overhaul), `0c2a9d4` (PR #31 UI a11y),
  `24eb5bc` (PR #30 3-pillar ergonomics + quantExecution wiring).
- 1 file untracked: `plans/reports/advise-261025-2343-comprehensive-roadmap-packet.md`.
- 1 stash cũ: `stash@{0}` — `WIP on main: b187b6f refactor: cycle-41 modularize 12 files`,
  ngày 2026-09-20, chứa 12 file dưới `src/forest/alpha/**` và `src/tree/alpha/**`.

**Quan trọng về stash:** đã xác minh `git merge-base --is-ancestor b187b6f main` → **YES**,
tức base của stash nằm trong `main`. Tuy nhiên stash vẫn là WIP chưa hoàn thành từ
2026-09-20 và có thể chứa công việc đã mất tích hoặc đã thay thế. **Không drop stash trong
phase này** — chỉ ghi nhận và đưa ra quyết định ở bước 4.

## Requirements

1. Tree ở đúng commit `origin/main`.
2. Baseline gate được ghi lại dưới dạng file trong plan.
3. Stash được xử lý rõ ràng (giữ hoặc xoá có chủ đích), không bỏ treo.
4. Untracked packet được lưu trữ đúng chỗ, không xoá.

## Files

| File | Quyền |
|---|---|
| `plans/261106-1416-revenue-seam-closure/baseline-gates.txt` | tạo mới |
| `plans/261106-1416-revenue-seam-closure/baseline-sha.txt` | tạo mới |
| `plans/reports/advise-261025-2343-comprehensive-roadmap-packet.md` | chuyển vào archive nội bộ |

## Steps

1. Xác minh tree yên tĩnh và không có tiến trình đang chạy trên repo này:
   ```bash
   git status --short --branch
   git stash list
   ps aux | grep -E "[t]rade-bot" | wc -l
   ```
2. Kéo về: `git pull --ff-only`. Nếu bị từ chối (không fast-forward), **dừng** — nghĩa là
   có công việc local chưa commit cần xử lý trước, đừng dùng `--no-rebase` hay merge.
3. Ghi baseline:
   ```bash
   git rev-parse HEAD | tee plans/261106-1416-revenue-seam-closure/baseline-sha.txt
   npm run quality:gate 2>&1 | tee plans/261106-1416-revenue-seam-closure/baseline-gates.txt
   ```
4. Xử lý stash: đọc `git stash show -p stash@{0}` kiểm tra file có khác biệt thật không.
   - Nếu nội dung đã nằm trong `main` (từng file giống nhau sau cycle-41 đã ship) →
     `git stash drop stash@{0}`.
   - Nếu có phần **không** nằm trong `main` → **dừng và hỏi user**, vì đây là công việc
     2026-09-20 có thể là chưa ship hoặc đã ship dưới dạng khác. Không tự ý drop.
5. Lưu trữ untracked packet: chuyển
   `plans/reports/advise-261025-2343-comprehensive-roadmap-packet.md` vào
   `plans/261106-1416-revenue-seam-closure/` (hoặc gi nguyên nếu repo có quy ước khác).
   **Không xoá** — đó là record có giá trị, chỉ cần không còn untracked lẻ.

## Validation

```bash
git status --short --branch    # → "## main...origin/main" (không behind/ahead)
git stash list                 # → rỗng, hoặc stash đã được quyết định có chủ ý
npx tsc --noEmit               # → 0 error
npx vitest run 2>&1 | tail -20  # → ghi số test thật vào baseline-gates.txt
npx knip                       # → 0 issue
```

Ghi số test thật vào baseline. Con số trong report cũ (3.881 / 6.000+) **không** dùng để
so sánh cho đến khi phase này cho ra số thật.

**Baseline đã đo tại `b683ca9` (2026-11-06, trước khi `pull --ff-only`):**

| Lệnh | Kết quả |
|---|---|
| `npm run type-check` | 0 error |
| `npm run lint` | 0 warning |
| `npx vitest run` | **6.036 tests / 723 test files — tất cả pass** |
| `npx knip` | 0 issue, exit 0 |

Số 6.036 thay cho con số 3.881 cũ trong report. Phase-01 chỉ cần **đo lại** bốn con số này
sau khi kéo, và ghi `baseline-gates.txt` / `baseline-sha.txt`.

## Risk & Rollback

Rủi ro thấp. Rollback: `git reset --hard <baseline-sha cũ>` cho phase này. Nếu stash bị
drop nhầm, khôi phục qua `git fsck --unreachable | grep <sha>` (recoverable trong reflog
window) — đây là lý do bước 4 bắt buộc phải xác minh trước khi drop.
