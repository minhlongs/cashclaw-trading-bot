---
title: "Phase 3: Batch-Merges"
status: completed
---

# Phase 3: Batch-Merges

## Overview

Chạy gộp thật theo 6 lô nhỏ, mỗi lô một commit, thứ tự "cặp lớn nhất trước" để lỗi lộ sớm ở lô 1
với các ca thách nhất. Lô 0 là canary — **một** cặp sạch, không có consumer trong `test/`, không
import nhiều dòng — chạy trước lô 1 rồi revert, để bẫy lỗi cơ học của script trước khi chúng lan ra
các cặp còn lại.

**Phân bổ phải khớp 57 file types bị xoá, không hơn không kém:** 63 file `*-types.ts` − 6 bị chặn
= 57 được xoá, gồm 39 cặp sạch (lô 0 lấy 1 canary trong đó) + 17 cặp có consumer trong `test/`
+ 1 ca đặc biệt `cont-stoikov-lob`. Cây còn lại: 69 + 6 = **75** file production.

**Key Insights — lý do suite xanh không phải cổng đủ, và cổng nào thật sự bắt lỗi gộp:**

1. **`vitest` không typecheck.** Vitest transpile bằng esbuild, là bỏ `import type` không resolve.
   Thực nghiệm đã làm: xoá `stoikov-microprice-types.ts` rồi để dangling import →
   `npx vitest run src/tree/quantlib` **exit 0**, `24 passed (24)`, trong khi
   `npx tsc --noEmit` **exit 2**. **`npm run type-check` là cổng bắt buộc, không được đổi.**
2. **Lô 1–4 và lô 6 chỉ chạm `src/`; lô 5 chạm cả `test/`.** Vì vậy lô 1–4 có thể dùng cổng thu hẹp
   `npx vitest run src/tree/quantlib`, nhưng **lô 5 phải chạy `npx vitest run test/quant`** — 17 cặp
   của lô 5 có consumer nằm trong `test/quant/`, và `vitest run src/tree/quantlib` không gom những
   file đó.
3. **`git diff public-sdk.ts | wc -l` = 0 là hằng số, không phải cổng.** `public-sdk.ts` chỉ
   re-export `abdi-ranaldo-types` và `corwin-schultz-types`, **cả hai đều bị chặn**. Lệnh này không
   thể fail với bất kỳ lô nào, nên nó không chứng minh gì. Cổng thay thế là `npx knip`, mà thực
   nghiệm đã chứng: nó bắt được import treo **và** chỉ đúng tên consumer trong `test/`
   (`test/quant/stoikov-microprice-engine.test.ts:3:41`) sau khi xoá file types.
4. **17 cặp trong 56 có consumer trong `test/`.** Phải đổi đường dẫn import cho chúng; đây quyết
   định đã chốt với người ra quyết định, không phải refactor test layer. 17 cặp này nằm trong
   **lô 5**, commit riêng.
5. **Cổng "vẫn đúng 6 blocked" không thấy được lỗi của chính nó.** File bị xoá nhầm thì không còn
   trong danh sách để đếm — blocked vẫn ra 6. Vì vậy bộ đếm cần thêm bất biến **số file types còn lại**,
   giảm đúng bằng kích thước lô, và ghi lại trong Regression Gate.
6. **6 cặp dùng `import type {` nhiều dòng.** Pattern strip một dòng không khớp 6 cặp đó, để lại
   import trỏ tới file đã bị `git rm`.
7. **Không dùng `git clean -fd`.** Cây này có nhiều session Claude cùng chỉnh sửa; reviewer đã
   quan sát một ca gộp `stoikov-microprice` đang chạy giữa chừng của session khác.
   `git clean -fd` xoá vĩnh viễn file chưa track. Recipe revert chỉ cần `git reset` rồi
   `git checkout --`.
8. **Không dùng `git add -A`.** Stage đúng danh sách path từ `merge-plan.md`, và so `git status
   --short` với danh sách đã kỳ vọng đó trước khi commit.

## Requirements

- [ ] Functional: 57 file `*-types.ts` bị gộp trong 6 lô, phân bổ từ bộ đếm phase 01:
      **39** cặp sạch (không consumer trong `test/`) — lô 0 là canary, lấy **1** cặp trong 39 đó,
      lô 1–4 gộp **38** cặp còn lại (chia 10/13/13/2 hoặc theo LOC giảm dần, miễn tổng đúng 38);
      **17** cặp có consumer trong `test/` ở lô 5; **1** ca đặc biệt `cont-stoikov-lob`
      (consumer là `-queue.ts`) ở lô 6. Tổng file types bị xoá = 39 + 17 + 1 = **57**;
      6 file bị chặn giữ lại; cây còn lại = 69 + 6 = **75** file production.
- [ ] Functional: `cont-stoikov-lob-types.ts` → `cont-stoikov-lob-queue.ts` xử lý riêng ở lô 6
      (không theo pattern engine; 77 dòng sau gộp).
- [ ] Functional: với 17 cặp ở lô 5, đổi đúng 1 dòng import trong mỗi file `test/` bị ảnh hưởng.
- [ ] Non-functional: mỗi lô một commit, message conventional, không có AI attribution.
- [ ] Non-functional: một lô fail → revert đúng lô đó, không kéo cả đợt.
- [ ] Non-functional: không file nào >120 LOC sau gộp; file kết quả lớn nhất ≤ **104**.
- [ ] Non-functional: không file nào trong `test/` bị xoá hoặc bỏ trống; chỉ đổi đường dẫn import.

## Architecture

```
lô 0  (canary, 1 cặp sạch)  → cùng vòng xác minh, không sửa gì trong test/
lô 1→4 (38 cặp sạch còn lại, sau khi lô 0 revert)
   run merge script on batch stems --write
   ├── npm run type-check                                → exit 0  (cổng bắt buộc)
   ├── npm run lint -- --max-warnings 0                  → exit 0  (eslint src/ only)
   ├── npx vitest run src/tree/quantlib                  → green, 0 TS2307
   ├── npx knip                                          → không xuất hiện "Unused files"
   ├── node scripts/count-type-importers.mjs           → blocked == 6, tổng nhóm đổi đúng bằng size lô
   ├── git diff <baseline> -- src/tree/quantlib/public-sdk.ts | wc -l   → 0
   └── git commit -m "refactor(quantlib): merge microstructure engine and type definitions"

lô 5  (17 cặp có consumer trong test/)
   ... cùng vòng, nhưng thêm npx vitest run test/quant  → green
   ... và đổi đường dẫn import trong các file test bị ảnh hưởng (≤ 1 dòng mỗi file)

lô 6  (cont-stoikov-lob, 1 cặp)
   ... cùng vòng + review bằng mắt: file kết quả đọc như "L2 queue + kiểu của nó"
```

Suite đầy đủ (`npm test`, ~175s) chỉ chạy ở cuối lô 6 và ở phase 04 — blast radius của lô 1–4 nằm
trong `src/tree/quantlib/`, và cổng thu hẹp đã phủ đủ với điều kiện **không** bỏ `type-check`.

## Related Code Files

| File | Hành động | Mô tả |
|---|---|---|
| `src/tree/quantlib/microstructure/*-engine.ts` (55 file) | Modify | Nối block type, xoá dòng `import type` |
| `src/tree/quantlib/microstructure/*-types.ts` (56 file) | Delete | `git rm`, chỉ file đã qua gate |
| `src/tree/quantlib/microstructure/cont-stoikov-lob-queue.ts` | Modify | Ca đặc biệt lô 6 |
| `src/tree/quantlib/microstructure/cont-stoikov-lob-types.ts` | Delete | Ca đặc biệt lô 6 |
| 6 file types bị chặn (xem plan.md) | **Không đụng** | `abdi-ranaldo`, `corwin-schultz`, `gatheral-transient-impact`, `hawkes-jump`, `kyle-obizhaeva-invariance`, `roll-spread` |
| **25** file trong `test/quant/` | Modify (lô 5 = 24 file, lô 6 = 1 file `v13`) | Chỉ đổi 1 dòng đường dẫn import, không xoá/không đổi assertion |

**Hai-mươi-bốn file test bị ảnh hưởng ở lô 5, thuộc 17 cặp gộp. Bảng này là danh sách kỳ vọng để
đối chiếu bằng tên sau lô 5 — không chỉ đếm:**

| File trong `test/` | Cặp gộp |
|---|---|
| `test/quant/bessembinder-kaufman.test.ts`, `test/quant/v60-apex-suite-simulation.test.ts` | bessembinder-kaufman |
| `test/quant/bgt-asymmetric-book.test.ts` | bgt-asymmetric-book |
| `test/quant/biais-lob-dynamics.test.ts` | biais-lob-dynamics |
| `test/quant/chordia-trading-activity.test.ts`, `test/quant/v61-apex-suite-simulation.test.ts` | chordia-trading-activity |
| `test/quant/copeland-galai-spread.test.ts` | copeland-galai |
| `test/quant/ekop-pin-engine.test.ts` | ekop-pin |
| `test/quant/foster-viswanathan-microstructure.test.ts` | foster-viswanathan |
| `test/quant/gkn-spread-engine.test.ts`, `test/quant/v25-apex-suite-simulation.test.ts` | gkn-spread |
| `test/quant/glosten-harris-spread-engine.test.ts` | glosten-harris-spread |
| `test/quant/hasbrouck-var-engine.test.ts` | hasbrouck-var |
| `test/quant/huang-stoll-spread-engine.test.ts` | huang-stoll-spread |
| `test/quant/kyle-adverse-selection.test.ts`, `test/quant/v12-full-suite-simulation.test.ts` | kyle-adverse-selection |
| `test/quant/kyle-cross-asset-microstructure.test.ts` | kyle-cross-asset |
| `test/quant/madhavan-smidt-spread-engine.test.ts`, `test/quant/v26-apex-suite-simulation.test.ts` | madhavan-smidt-spread |
| `test/quant/mrr-spread-decomposition-engine.test.ts`, `test/quant/v22-apex-suite-simulation.test.ts` | mrr-spread-decomposition |
| `test/quant/rosu-orderbook-choice.test.ts` | rosu-orderbook |
| `test/quant/stoikov-microprice-engine.test.ts`, `test/quant/v19-apex-suite-simulation.test.ts` | stoikov-microprice |

Tám file `v*` (`v12`, `v13`, `v19`, `v22`, `v25`, `v26`, `v60`, `v61`) là suite mô phỏng gom nhiều engine;
mỗi file có thể xuất hiện ở **nhiều** lô, nên số lần đổi trong `git diff -- test/` lớn hơn 17 dòng.
Đó là lý do chỉ số ở phase 04 đo tổng dòng đổi (≤ **50**, tức 25 xoá + 25 thêm), không đếm số file.
`v13-full-suite-simulation.test.ts` thuộc lô 6, không lô 5: nó import `cont-stoikov-lob-types`, tức cặp
duy nhất thuộc lô 6 — đây chính là dòng từng bị bỏ sót khi chỉ nhìn vào 56 cặp có sibling `-engine.ts`.

**Quan trọng — 4 trường hợp không theo pattern phải đọc tay trước khi gộp:**
`gatheral-transient-impact-types.ts` (consumer thứ hai `alfonsi-lob-resilience.ts` — bị chặn),
`hawkes-jump-types.ts` (consumer khác thư mục — bị chặn), `kyle-obizhaeva-invariance-types.ts`
(consumer `kyle-obizhaeva-impact-calculator.ts` — bị chặn), `cont-stoikov-lob-types.ts`
(consumer là queue không phải engine — gộp ở lô 6, khác pattern). Ba trong số đó **đã bị gate loại**,
nên chỉ 1 ca đi vào lô 6.

Hai cặp có cùng họ tên phải kiểm bằng mắt vì bộ đếm dễ nhầm, dù đã khớp basename chính xác:
`stoikov-microprice` (engine, và **2** consumer trong `test/`) và `huang-stoll-spread`
(`stoll-spread` là hậu đề của tên file này). Cả hai đều ở lô 5 và lô 1–4.

## Implementation Steps

1. **Xác nhận lối vào.** Đọc `merge-plan.md`, lấy đúng các stem có trạng thái `safe`, sắp theo
   thứ tự lô đã ghi.
2. **Lô 0 — canary.** Chọn **1** cặp thuộc `safe-clean` (không consumer trong `test/`) và dùng
   `import type {` một dòng — `roll-implicit-spread` (24 dòng sau gộp, thứ tự LOC 57/57, chậm nhất).
   - `node scripts/merge-microstructure-types.mjs roll-implicit-spread --write`
   - Chạy toàn bộ cổng trong Architecture ở trên; **kỳ vọng tất cả xanh.**
   - Nếu có gì đỏ, dừng cả đợt và điều tra lô trước — lô 0 bị sinh ra để lỗi cơ học của script bị
     bắt ở đây chứ không phải ở lô 1 sau commit.
   - Pass → revert canary (`git reset && git checkout --`) để lô 1 chạy trên cây sạch, rồi viết
     post-canh báo vào báo cáo.
3. **Lô 1 — 12 cặp safe-clean có LOC kết quả lớn nhất** (nhóm sạch 39 cặp, trừ canary của lô 0,
   chọn 12 cặp có LOC kết quả cao nhất để lỗi lộ sớm).
   - `node scripts/merge-microstructure-types.mjs --batch lô1 --write`
     (script đọc danh sách stem của lô từ `merge-plan.md`; không dùng placeholder trên dòng lệnh)
   - `git diff --stat` — đếm số file đổi; kỳ vọng **đúng 24** (12 engine sửa + 12 types xoá).
     So đúng với danh sách đã kỳ vọng từ `merge-plan.md`, không chỉ đếm 24.
   - `npm run type-check` → `npm run lint -- --max-warnings 0` → `npx vitest run src/tree/quantlib`
   - `npx knip` → không có mục "Unused files"
   - `node scripts/count-type-importers.mjs` → vẫn đúng **6 blocked**; số file types giảm đúng 12.
   - `git diff <baseline-sha> -- src/tree/quantlib/public-sdk.ts | wc -l` → **0**
   - `find ... -name '*.ts' ! -name '*.test.*' -exec wc -l {} + | awk '$1>120 && $2!="total"'` → rỗng
   - Toàn bộ xanh → `git add` **đúng danh sách path** từ `merge-plan.md` (không `-A`), rồi
     `git status --short` phải khớp danh sách kỳ vọng trước khi commit
     `refactor(quantlib): merge microstructure engine and type definitions`.
   - Có gì đỏ → **revert đúng lô 1** (`git reset && git checkout -- src/tree/quantlib/microstructure`),
     điều tra lô đó, đừng sang lô 2.
4. **Lô 2, 3, 4 — lặp lại chính xác vòng xác minh trên**, sao cho tổng bốn lô = **38** cặp
   (chọn 10/13/13/2, hoặc chia theo LOC giảm dần từ `merge-plan.md` — miễn tổng đúng 38).
   Nhóm sạch có 39 cặp, trừ canary của lô 0 là 38.
5. **Lô 5 — 17 cặp có consumer trong `test/`.** Ngoài vòng xác minh trên, lô này phải:
   - chạy thêm `npx vitest run test/quant` → green (điểm đến thật sự của 17 cặp này);
   - đổi đường dẫn import trong từng file `test/` bị ảnh hưởng, tối đa 1 dòng mỗi file, từ
     `'.../<x>-types'` thành `'.../<x>-engine'`; các ký tự khác (tên kiểu, assertion, comment) không đổi;
   - `git diff --stat` cho phần `test/` phải khớp đúng số dòng đã đổi — xem Tests After.
6. **Lô 6 — ca đặc biệt.** `cont-stoikov-lob-types.ts` (25 dòng) vào `cont-stoikov-lob-queue.ts`
   (55 dòng) = 77 dòng. Khác pattern engine, nên **review bằng mắt** sau khi script chạy: file
   kết quả vẫn đọc như một module "L2 queue + kiểu của nó", và chỉ đúng 1 dòng import bị đổi.
   Kiểm tra cycle **không còn là bằng chứng vô nghĩa** như bản thảo cũ (bản cũ yêu cầu xác nhận
   "không có import vòng", nhưng queue này có **0 production consumer** ngoài chính nó — luôn đúng).
   Tóm lại: kiểm bằng cách `grep` trong cả `test/`, `tests/`, `bin/`, chứ không phải mô tả bằng mắt.
7. **Suite đầy đủ một lần** sau lô 6: `npm test`, kỳ vọng 720 files / 6.003 tests.
8. **Không mở rộng phạm vi.** Không đụng `src/tree/quantlib/execution/` (cùng hình dạng, ~37 file
   type + 38 non-type) và 154 file `*-types.ts` ngoài `microstructure` trong đợt này. Ghi lại như
   đề xuất tiếp theo trong roadmap — không tự ý làm.

## Tests Before

- [ ] Trước lô 1, chạy lại một lần `npx vitest run src/tree/quantlib` ở trạng thái sạch để biết
      thời gian chạy và xác nhận baseline xanh trong worktree này.
- [ ] Trước lô 1, xác nhận 4 ca "không theo pattern" bằng `grep` import của chúng, để chắc gate
      không bị lệch so với kỳ vọng 6 blocked.
- [ ] Trước lô 1, xác nhận `node --version` chạy được (Node ≥ 22 để dùng được `.mjs` trỏ tiếp
      `package.json` `type`). `tsx` **không** có trong `package.json` lẫn `node_modules/.bin` — đã kiểm —
      nên script phải là `.mjs` chạy bằng `node`, không bao giờ `npx tsx`.
- [ ] Trước lô 1, xác nhận script strip **thực sự xoá** được dòng import của một cặp multi-line
      (`kyle-adverse-selection`, 3 dòng) trong dry-run, không chỉ trong `tmp/`.

## Refactor

Đây chính là phần thay đổi protected code: gộp type vào engine/queue consumer duy nhất.

## Tests After

- [ ] Sau lô 6: `npm test` đầy đủ 720 files / 6.003 tests.
- [ ] Không test nào bị xoá hoặc làm yếu; nếu một test không còn cần thiết vì file types đã bay,
      chỉ xoá khi test đó chỉ nhằm import một path vừa đổi (ghi rõ trong commit).

## Regression Gate

Mỗi lô:

```bash
npm run type-check                              # exit 0 — BẮT BUỘC, cổng duy nhất bắt TS2307 trong test/
npm run lint -- --max-warnings 0                # exit 0 (eslint src/ only)
npx vitest run src/tree/quantlib                # green
npx knip                                        # no "Unused files"
node scripts/count-type-importers.mjs         # blocked == 6; số file types giảm đúng bằng size lô
git diff <baseline-sha> -- src/tree/quantlib/public-sdk.ts | wc -l   # == 0
find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' \
  -exec wc -l {} + | awk '$1>120 && $2!="total"'   # empty
```

Lô 5 thêm:

```bash
npx vitest run test/quant                       # green — nơi 17 cặp này thực sự được tiêu thụ
```

Sau lô 6:

```bash
npm test    # 720 files / 6003 tests
```

## Success Criteria

- [ ] Số file production trong `microstructure` giảm **57** (132 → **75**), xác nhận bằng
      `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' | wc -l`.
- [ ] Số file `*-types.ts` còn lại = **6**, và đúng là 6 file trong danh sách bị chặn.
- [ ] `awk '$1>120'` rỗng; file kết quả lớn nhất ≤ **104** dòng.
- [ ] `git diff <baseline-sha> -- src/tree/quantlib/public-sdk.ts | wc -l` = 0.
- [ ] 6 commit refactor (lô 0 bị revert, nên 5–6 commit tuỳ cách ghi lô 0), mỗi lô một commit,
      đều revert được độc lập.
- [ ] `npm test` 720/6.003 xanh ở cuối lô 6.
- [ ] **25** file trong `test/` chỉ đổi đúng 1 dòng đường dẫn import mỗi file, không xoá/đổi assertion:
      `git diff <baseline> -- test/ | grep -c '^[+-]'` ≤ **50** (25 xoá + 25 thêm).

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Một lô fail sau khi đã commit lô trước | Mỗi lô một commit → revert đúng lô, không kéo đợt |
| Gate bỏ sót consumer ngoài thư mục | Bộ đếm quét cả `src/`, `test/`, `tests/`, `bin/`; test 3 ca khó ở phase 01 |
| Suite xanh nhưng contract đổi | `type-check` bắt buộc mỗi lô + `npx knip` mỗi lô (thực nghiệm: cả hai đều bắt được) |
| `vitest src/tree/quantlib` xanh giả trên cây hỏng | Đã kiểm chứng: esbuild bỏ type import. Không cho phép bỏ `type-check` khỏi cổng lô |
| Script để lại dòng import treo (7 cặp multi-line) | Strip block-aware; test trước lô 1 trên `kyle-adverse-selection` trong dry-run |
| Cặp bị xoá nhầm | `find` + count bất biến: blocked == 6 và số types giảm đúng bằng size lô |
| `git add -A` quét ca gộp giữa chừng của session khác | Stage đúng path list, so `git status --short` với danh sách kỳ vọng |
| Revert recipe xoá file chưa track của session khác | Bỏ `git clean -fd`; chỉ `git reset && git checkout --` |
| Vô tình gộp file bị chặn | Script đọc đúng danh sách `safe` từ `merge-plan.md`; lô 0 canary |
| Làm yếu test để xanh | Success Criteria giới hạn diff `test/` ≤ 50 dòng đổi |

## Security Considerations

Không thay đổi auth, billing, hay xử lý input. Không đụng `src/ee/**`. Không có secret hay network.
Diff trong `test/` chỉ là đường dẫn import, không mở rộng bề mặt API.

## Next Steps

Phase 04 đóng cửa: đo lại toàn bộ chỉ số, so knip với baseline, và ghi deviation nếu số cuối lệch 75.
