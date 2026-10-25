---
title: "Phase 2: Merge-Script"
status: completed
---

# Phase 2: Merge-Script

## Overview

Viết một script gộp cơ học, chạy được trên một tập cặp chỉ định, để không phải sửa tay 57 lần
(57 file `*-types.ts` sẽ bị xoá: 56 cặp engine + 1 ca queue).
Vì cả 63 file type trong `microstructure` đều **thuần type/interface, 0 value export** (đã kiểm chứng
bằng grep), thao tác là nối văn bản chứ không cần AST.

Phase này **không gộp batch thật** — chỉ chạy thử trên 1 cặp, kiểm tra diff, rồi revert.

**Key Insights**

- Không cần AST: không có value export, không có thứ tự khởi tạo, không có side-effect. Nối block
  `export interface`/`export type` vào cuối file engine là đủ.
- **Strip phải nhận biết nhiều dòng.** Pattern một dòng `^\s*import type \{.*\} from '...';$`
  không khớp 7 trong 57 cặp, vì chúng viết `import type {` rồi xuống dòng. Các cặp đó là
  `kyle-adverse-selection` (3 dòng), `stoikov-microprice` (5), `glosten-harris-spread` (4),
  `kyle-lambda` (5), `cont-delarrard-queue` (4), `cont-kukanov-placement` (4),
  `cont-stoikov-lob` (4). Cách làm đúng: tìm **clause** `from
  './<stem>-types'`, rồi xoá toàn bộ statement chứa nó (từ dòng bắt đầu `import type {` đến dòng
  kết thúc bằng `;`).
- **Script phải thất bại nếu dòng import sống sót.** Sau khi xoá, grep lại file engine xem còn
  tham chiếu `<stem>-types` không. Còn → báo lỗi, không `git rm`.
- **Phải khớp cả hai dạng specifier** (`./<stem>-types` và `<...>/microstructure/<stem>-types`) và
  cả hai loại quote.
- Nhà phân phối script không có trong worktree: `tsx` **không** có trong `package.json` hay
  `node_modules/.bin` (đã kiểm trực tiếp). Nên script phải là `.mjs` chạy bằng `node` —
  **không** dùng `npx tsx` trong bất kỳ lệnh nào của phase này hay phase 03.
- `import type` và `import {...}` khác nhau: nếu engine import cả type lẫn value từ cùng file, chỉ xoá
  phần type. Ở `microstructure` không có ca này, nhưng script phải báo lỗi thay vì xoá mù.

## Requirements

- [ ] Functional: nhận danh sách cặp (stem hoặc đường dẫn engine) làm argument, gộp đúng các cặp đó.
- [ ] Functional: nối type vào engine, xoá `import type` tương ứng, `git rm` file types.
- [ ] Functional: in `git diff --stat` sau khi chạy để đối chiếu.
- [ ] Non-functional: mặc định **dry-run**; chỉ ghi file khi có `--write`.
- [ ] Non-functional: idempotent — chạy hai lần không nhân đôi block type.
- [ ] Non-functional: từ chối gộp nếu LOC kết quả >120 (fail closed, không bao giờ vượt trần).

## Architecture

```
scripts/merge-microstructure-types.mjs
   input: stems từ merge-plan.md  |  --write  |  --dry-run (default)
      │
      ├─ validate: importer count == 1, LOC(engine)+LOC(types)-importLines+1 <= 120
      ├─ read types file → extract export interface/type blocks (kèm JSDoc ngay trên)
      ├─ append blocks to engine file (skip if identical block already present)
      ├─ strip the statement referencing `<stem>-types`, matching both quote styles
      │    (bao gồm cả form nhiều dòng — tìm clause `from`, xoá từ dòng mở tới dòng kết thúc)
      ├─ post-check: file engine còn tham chiếu `<stem>-types` → FAIL, không git rm
      └─ (only with --write) `git rm <stem>-types.ts`
```

Hằng số +1 cho dòng trống phân cách khi ước lượng LOC. Không dùng +2 như bản thảo cũ: bản cũ không
biết 6 cặp sẽ trừ 3–5 dòng import, nên ước lượng của nó lệch về phía lạc quan; khi đã trừ đúng số
dòng statement, +1 là đủ biên.

## Related Code Files

| File | Hành động | Mô tả |
|---|---|---|
| `scripts/merge-microstructure-types.mjs` | Create | Script gộp, mặc định dry-run |
| `test/scripts/merge-microstructure-types.test.ts` | Create | Test trên thư mục tạm (`fs.mkdtempSync`), không đụng `src/` |
| `test/scripts/count-type-importers.test.ts` | Create | Từ phase-01; nơi script này import lại bộ đếm |

Production file nào cũng chưa bị sửa trong phase này.

## Implementation Steps

1. **Viết phần trích xuất.** Đọc file types, tách các block bắt đầu bằng
   `export interface <Tên>` hoặc `export type <Tên>` cho đến dòng đóng `}` của block đó
   (`export type X = ...;` một dòng thì lấy cả dòng). Giữ nguyên comment JSDoc ngay trên block.
2. **Viết phần validate (fail-closed).**
   - Đếm importer bằng cùng logic phase 01 (DRY — gộp bộ đếm vào
     `scripts/count-type-importers.mjs`, `export` hàm dùng chung rồi `import`, đừng chép logic;
     vì cả hai script đều là `.mjs` nên mới `import` được nhau).
   - Nếu importer ≠ 1 → **từ chối**, in lý do và dừng cặp đó.
   - Nếu `wc(engine) + wc(types) − <số dòng statement import> + 1 > 120` → **từ chối**, in lý do.
     Phải trừ đúng số dòng **vật lý** của statement (7 cặp dùng `import type {` nhiều dòng), rồi
     +1 cho dòng trống phân cách. Dùng `+2` như bản thảo cũ sẽ lệch lạc quan ở 7 cặp đó.
3. **Viết phần gộp.** Nối block vào cuối file engine (có một dòng trống phân cách). Xoá **toàn bộ
   statement** tham chiếu `<stem>-types` theo hướng statement-aware (tìm clause `from`, xoá từ dòng
   mở `import type {` tới dòng kết thúc `;`) — không dùng pattern một dòng, vì 7/57 cặp trải nhiều
   dòng. Idempotent: nếu block đã có mặt
   (so theo tên `export interface/type <Tên>`), bỏ qua.
4. **Viết phần CLI.** `--dry-run` (mặc định, chỉ in diff sẽ có) và `--write` (ghi thật + `git rm`).
   Nhận stems qua flag lặp lại hoặc từ file danh sách.
5. **Viết `merge-microstructure-types.test.ts`** — chạy trên bản copy trong `tmp/` bằng
   `fs.mkdtempSync`, không bao giờ đụng `src/`:
   - test dry-run không tạo file mới và không `git rm`;
   - test write nối đúng block type và xoá đúng dòng import;
   - test idempotent: chạy write hai lần → nội dung giống nhau;
   - test fail-closed khi importer = 2 (dùng case rỗn giả lập);
   - test fail-closed khi LOC kết quả >120.
6. **Chạy test**, rồi chạy thử trên **một cặp an toàn nhỏ** trong `src/` — chọn cặp có LOC kết quả
   nhỏ nhất từ `merge-plan.md`:
   `node scripts/merge-microstructure-types.mjs roll-implicit-spread --write`
7. **Kiểm tra bằng mắt**: `git diff --stat`, `git diff` trên đúng file engine và confirm 4 điều —
   block type đã vào, dòng import đã bay, file types đã bị `git rm`, không có dòng nào khác đổi.
8. **Chạy cổng thu hẹp**: `npm run type-check && npm run lint -- --max-warnings 0 && npx vitest run src/tree/quantlib`.
9. **Revert ca thử**: `git checkout -- src/tree/quantlib/microstructure/` và
   `git clean -fd src/tree/quantlib/microstructure/` (xoá file types đã bị `git rm` khỏi index — nhớ
   `git reset` trước nếu đã stage). Confirm `git status --short` sạch trước khi kết thúc phase.

## Tests Before

- [ ] Test extract/merge/idempotent/fail-closed (5 case ở bước 5) viết trước, chạy trên `tmp/`.

## Refactor

Không có refactor production trong phase này — chỉ revert ca thử.

## Tests After

- [ ] `npx vitest run test/scripts/` xanh 5 case — dòng tóm tắt của vitest phải ghi số file test
      **> 0** (`scripts/` không nằm trong `include`, nên `vitest run scripts/` là xanh giả).
- [ ] Ca thử 1 cặp qua cả 3 cổng rồi được revert sạch.

## Regression Gate

```bash
npm run type-check                      # exit 0
npm run lint -- --max-warnings 0        # exit 0
npx vitest run test/scripts/           # 5 merge-script cases green (file count > 0)
npx vitest run src/tree/quantlib        # green on the trial pair
git status --short                      # empty at phase end
```

## Success Criteria

- [ ] `scripts/merge-microstructure-types.mjs` tồn tại; mặc định dry-run; `--write` mới ghi.
- [ ] 5 test xanh, không test nào chạm trực tiếp `src/tree/quantlib/microstructure`.
- [ ] Ca thử: diff chỉ gồm đúng 4 thay đổi mong đợi, không có dòng lạ.
- [ ] Cuối phase, `git status --short` rỗng — ca thử đã revert hoàn toàn.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Script xoá nhầm dòng `import` khác | Mẫu bám theo `<stem>-types`, test trên case rỗn |
| Nhân đôi block khi chạy lại | Kiểm tra block đã tồn tại theo tên export; test idempotent |
| Script chạy trên `src/` trong test | Bắt buộc `fs.mkdtempSync`; test không nhận đường dẫn thật |
| Revert sót, để file types rơi vào trạng thái staged-deleted | `git reset` trước `git checkout`, rồi verify bằng `git status --short` |

## Security Considerations

Script chỉ đọc/ghi trong `src/` và `tmp/`, không mạng, không secret. `git rm` chỉ chạy khi có
`--write` và sau khi validate pass.

## Next Steps

Phase 3 chạy script theo lô trên các cặp trong `merge-plan.md`.
