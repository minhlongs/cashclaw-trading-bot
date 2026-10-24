---
title: "Phase 1: Safety-Gate-and-Baseline"
status: completed
---

# Phase 1: Safety-Gate-and-Baseline

## Overview

Thiết lập hai thứ trước khi chạm vào bất kỳ file source nào: (1) **bộ đếm importer tự động** —
làm cổng an toàn cho toàn bộ đợt; (2) **baseline đo được** — mốc xanh để mỗi lô sau này so chiếu
và revert đích.

Phase này không sửa file production nào. Nó chỉ tạo script đo + artefact trong `plans/`, và **một
file test** trong `test/scripts/` (không phải production).

**Key Insights**

- Bộ đếm phải quét **cả repo**, không chỉ `src/`. Phiên bản đầu của bộ đếm chỉ quét `src/` và
  loại trừ mọi path chứa `.test.`; kết quả là 17 cặp có consumer trong `test/` bị đếm nhầm là
  an toàn. Đây là lỗi Critical: `tsc --noEmit` sẽ đỏ ở chính những cặp đó.
- Bộ đếm phải khớp cả hai dạng specifier. `public-sdk.ts` import bằng đường dẫn dài
  (`./microstructure/abdi-ranaldo-types`), nên grep trong thư mục con với mẫu `./<name>` sẽ **bỏ sót**
  consumer này và đánh dấu sai một file bị chặn thành "safe". Đây là lỗi đã từng xảy ra trong
  phiên khảo sát.
- Bộ đếm phải khớp **basename chính xác**, không dùng "đuôi kết thúc bằng". `stoll-spread-types`
  là hậu tố thật của `huang-stoll-spread-types`, nên một test kiểu đuôi sẽ bịa ra importer.
- Phải tính LOC kết quả bằng cách trừ đúng số dòng của statement import. 7 cặp dùng
  `import type {` trải nhiều dòng — nếu chỉ trừ 1 dòng, ước lượng sẽ lệch 2–4 dòng.

## Requirements

- [ ] Functional: một script đo, chạy lại được, in ra 4 nhóm — blocked / safe-with-test / safe-clean / no-engine.
- [ ] Functional: bảng merge plan (`merge-plan.md`) gồm mỗi cặp: tên, LOC engine, LOC types, LOC kết quả, trạng thái.
- [ ] Non-functional: script không sửa file production; có exit code rõ ràng.
- [ ] Non-functional: baseline ghi được số chính xác 720/6.003 để phase sau so chiếu.

## Architecture

Ba artefact, không có luồng runtime:

```
scripts/count-type-importers.mjs  (read-only: quét src/ + test/ + tests/ + bin/, in ra stdout)
        │
        ├──> plans/.../merge-plan.md   (bảng blocked/safe-with-test/safe-clean + LOC kết quả)
        └──> plans/reports/baseline-sha.txt + baseline-gates.txt
```

## Related Code Files

| File | Hành động | Mô tả |
|---|---|---|
| `scripts/count-type-importers.mjs` | Create | Bộ đếm importer, read-only, fail-closed nếu tổng ≠ 63 |
| `test/scripts/count-type-importers.test.ts` | Create | Assertion trên cây thật (4 ca đã biết + 2 ca đuôi tên), chạy qua `npx vitest run test/scripts/` |
| `plans/261024-1346-microstructure-type-consolidation/merge-plan.md` | Create | Bảng cặp gộp, sinh từ output script |
| `plans/reports/baseline-sha.txt` | Create | HEAD SHA làm mốc revert và diff |
| `plans/reports/baseline-gates.txt` | Create | Kết quả type-check/lint/test/knip ở baseline |
| `plans/reports/knip-baseline.txt` | Create | Mốc knip để phase 04 so chiếu |
| `vitest.config.ts` | Read | Không sửa; chứng minh `test/**` trong include, `scripts/**` không có |

Không file production nào bị sửa trong phase này.

## Implementation Steps

1. **Ghi baseline SHA.** `git rev-parse HEAD > plans/reports/baseline-sha.txt`.
2. **Chạy 3 cổng xanh một lần, ghi kết quả.**
   - `npm run type-check` (exit 0, không output)
   - `npm run lint -- --max-warnings 0` (exit 0)
   - `npm test` (phải ra `Test Files 720 passed (720)` và `Tests 6003 passed (6003)`; nếu khác, **dừng và điều tra** — đừng đoán)
   Ghi từng lệnh + exit code + dòng tóm tắt vào `plans/reports/baseline-gates.txt`.
3. **Ghi baseline knip.** `npx knip > plans/reports/knip-baseline.txt 2>&1; echo "exit=$?" >> plans/reports/knip-baseline.txt`. Để phase 04 so chiếu.
4. **Viết `scripts/count-type-importers.mjs`.** Logic, chỉ đọc:
   - Quét `src/tree/quantlib/microstructure/*-types.ts`.
   - **Quét importer trong cả repo**, tức `src/`, `test/`, `tests/`, `bin/`, và mọi
     `*.config.ts` ở gốc. **Không** bỏ qua đường dẫn chứa `.test.`.
     Lý do: `vitest.config.ts` gom `test/**` vào suite, và `tsconfig.json`
     (`include: ["**/*.ts"]`) để `test/` vào `tsc --noEmit`. File test là consumer thật.
   - Khớp specifier bằng **basename chính xác**, không dùng "đuôi kết thúc bằng".
     `stoll-spread-types` là hậu tố thật của `huang-stoll-spread-types`; test hậu tố sẽ bịa
     một importer không tồn tại và đánh dấu sai `stoll-spread-types` thành blocked.
     Basename = đoạn cuối sau dấu `/`, đã bỏ phần mở rộng; phải **bằng** `<stem>-types` hoặc `<stem>`.
   - Chấp nhận cả 3 dạng: `import ... from '<spec>'`, `export ... from '<spec>'`,
     `import('<spec>')`, `require('<spec>')`; chấp nhận cả `'` và `"`.
   - Với mỗi file `<stem>-types.ts`, tính LOC kết quả sau gộp:
     `wc(engine) + wc(types) − <số dòng vật lý của statement import tham chiếu> + 1`
     (đoán trước một dòng trống phân cách). Statement nhiều dòng phải đếm **đủ số dòng** của nó,
     không chỉ dòng `from`.
   - Phân loại thành bốn nhóm, tổng phải đúng 63, không stem nào nằm hai nhóm:
     - `blocked`: ≥2 production importer (không đếm `test/`).
     - `safe-with-test`: đúng 1 production importer, và ≥1 importer trong `test/`.
     - `safe-clean`: đúng 1 production importer, không có trong `test/`.
     - `no-engine`: không có sibling `<stem>-engine.ts`.
   - In tổng kết cuối và **fail-closed** nếu tổng bốn nhóm ≠ 63, hoặc có hai nhóm giao nhau.
5. **Chạy script, đối chiếu với kỳ vọng**: 63 file types; **6 blocked**;
   **57 safe** (production importer = 1); trong đó **18 safe-with-test** và **39 safe-clean**;
   **56 cặp** có engine sibling; **1 cặp** consumer là queue (`cont-stoikov-lob`), và nó có test consumer nên thuộc nhóm safe-with-test, không phải no-engine;
   0 cặp vượt 120 LOC sau gộp; file kết quả lớn nhất **104**.
   Nếu số liệu lệch, **dừng** và điều tra trước khi sang phase 2 — kỳ vọng này là căn cứ của
   toàn bộ plan. Được phép điều tra, **không** được sửa con số kỳ vọng cho khớp output.
6. **Kiểm tra tay hai ca đuôi tên** trước khi tin bộ đếm, vì đây là lỗi duy nhất mà bộ đếm có
   thể mắc mà không có dấu hiệu đỏ khác:
   - `stoll-spread-types.ts` phải ra **safe-clean** với đúng 1 importer là
     `stoll-spread-engine.ts`, và danh sách importer **không** chứa
     `huang-stoll-spread-engine.ts`.
   - `huang-stoll-spread-types.ts` phải ra **safe-with-test** với 1 production importer
     (`huang-stoll-spread-engine.ts`) và 1 importer trong `test/quant/huang-stoll-spread-engine.test.ts`.
7. **Sinh `merge-plan.md`** từ output script: bảng đầy đủ, cột
   `blocked / safe-with-test / safe-clean / no-engine`, LOC kết quả, đường dẫn tuyệt đối từng
   importer của 6 file blocked, và danh sách consumer trong `test/` của 18 cặp safe-with-test.
8. **Thứ tự hóa cặp an toàn**: sắp giảm dần theo LOC kết quả (cặp lớn nhất trước) rồi ghi thứ tự
   vào `merge-plan.md`. Các cặp `safe-with-test` được tách ra khỏi hàng và xếp vào **lô 5** để
   phase 3 chỉ việc đọc.

## Tests Before

Chưa có test cho script. Nhưng phase này phải **chứng minh script đúng** trước khi tin nó:

- [ ] Test tính đúng trên 1 ca đã biết: `roll-spread-types.ts` phải ra **blocked, 2 importer**
      (`roll-spread-engine.ts`, `roll-effective-spread-engine.ts`) — đây là ca có 2 engine, dễ đoán.
- [ ] Test tính đúng trên ca cross-directory: `hawkes-jump-types.ts` phải ra **blocked**, và danh sách
      importer phải chứa `src/tree/quantlib/portfolio/ledoit-wolf-shrinkage.ts`.
- [ ] Test tính đúng trên ca SDK: `abdi-ranaldo-types.ts` phải ra **blocked, 3 importer**, danh sách
      chứa `src/tree/quantlib/public-sdk.ts`.
- [ ] **Test âm bắt lỗi bỏ quét `test/`:** `ekop-pin-types.ts` phải ra **safe-with-test**, danh sách
      importer phải chứa `test/quant/ekop-pin-engine.test.ts`. Nếu script vẫn loại trừ `.test.`
      (lỗi nguyên gốc), assertion này phải **fail**.
- [ ] **Test âm bắt lỗi đuôi tên:** `stoll-spread-types.ts` phải ra **safe-clean**, danh sách importer
      chứa đúng `stoll-spread-engine.ts` và **không** chứa `huang-stoll-spread-engine.ts`.
- [ ] **Test âm cho test đuôi tên phía kia:** `huang-stoll-spread-types.ts` phải ra **safe-with-test**
      với 1 production importer và đúng 1 importer trong `test/`.
- [ ] Test âm: grep mẫu không được khớp tên file xuất hiện trong comment/JSDoc — xác nhận bằng cách
      đếm tay 3 file và đối chiếu.
- [ ] Test bất biến tổng: bốn nhóm cộng lại phải = 63 và không stem nào nằm ở hai nhóm.

Viết các assertion này thành `test/scripts/count-type-importers.test.ts`, khởi tạo trên file thật,
read-only. **Không** đặt trong `src/` — lý do đầy đủ ở đoạn ngay dưới.
**Test phải viết và chạy trước khi dùng output script cho phase 3.**

**Vị trí file test — vì `vitest run scripts/` không gom được gì.** `include` của
`vitest.config.ts` là `src/**`, `test/**`, `tests/**`, `bin/**` — **không có `scripts/**`**.
Chạy `npx vitest run scripts/` sẽ báo "no test files found" và exit 0, tức là xanh giả. Hai file
test script của plan này vì thế phải đặt ở `test/scripts/` (hoặc phải sửa `vitest.config.ts`,
là thay đổi config dùng chung mà plan này không nhận). Chọn `test/scripts/`.

## Refactor

Không có — phase này không sửa production.

## Tests After

- [ ] `npx vitest run test/scripts/` xanh, và dòng tóm tắt của vitest phải ghi rõ số file test
      **> 0**, không phải "no test files found".
- [ ] Script chạy lại hai lần cho cùng một output (determinism check).

## Success Criteria

- [ ] `plans/reports/baseline-sha.txt` tồn tại, khớp `git rev-parse HEAD`.
- [ ] `plans/reports/baseline-gates.txt` ghi 720 files / 6.003 tests pass, type-check exit 0, lint exit 0.
- [ ] `plans/reports/knip-baseline.txt` tồn tại.
- [ ] `scripts/count-type-importers.mjs` tồn tại, chạy được, in đúng: 63 file types, 6 blocked,
      57 safe (18 safe-with-test + 39 safe-clean), 56 cặp có engine + 1 cặp queue,
      0 cặp vượt 120 LOC, file kết quả lớn nhất 104.
- [ ] `merge-plan.md` liệt kê đủ 63 file với cột trạng thái; 18 cặp safe-with-test đã được xếp vào lô 5 (17 cặp engine) và lô 6 (`cont-stoikov-lob`).
- [ ] 6 file blocked đều ghi rõ danh sách importer đầy đủ, không ghi "nhiều importer" chung chung.
- [ ] Hai ca đuôi tên (`stoll-spread` / `huang-stoll-spread`) đúng nhóm, đúng danh sách importer.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Bộ đếm bỏ quét `test/` (lỗi Critical nguyên của plan này) | Quét cả `src/`, `test/`, `tests/`, `bin/`; test âm bắt buộc trên `ekop-pin` |
| Bộ đếm khớp nhầm đuôi tên (`stoll-spread` / `huang-stoll-spread`) | Basename chính xác; 2 test âm bắt buộc |
| Bộ đếm bỏ sót dạng import (`import type {...} from ...`, `export ... from ...`, double-quote, `import()`) | Mẫu khớp cả 4 dạng; kiểm chứng bằng 3 ca đã biết ở Tests Before |
| Mẫu khớp thừa trong comment/JSDoc | Nhận diện bằng test âm đối chiếu đếm tay |
| `vitest run scripts/` xanh giả vì không gom được test nào | Đặt test ở `test/scripts/`, nằm trong `include`; step Tests After ghi con số file test thật |
| `npx tsx` không có trong worktree | Viết script `.mjs` và chạy bằng `node`; không cần flag strip-types |
| Baseline thực tế không phải 720/6.003 | Dừng và điều tra, ghi SHA; không sửa con số kỳ vọng cho khớp |

## Security Considerations

Không có auth, network, hay secret. Script chỉ đọc và in stdout. Không ghi credential vào artefact.

## Next Steps

Sau khi phase này xanh: phase 2 viết merge script dùng `merge-plan.md` làm input.
