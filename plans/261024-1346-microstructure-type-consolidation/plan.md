---
title: "QuantLib Microstructure Type-File Consolidation"
description: "Merge the 57 single-importer microstructure *-types.ts files into their sole consuming engine/queue module to cut directory file count with zero behavior change."
status: pending
priority: P3
effort: 6h
issue: 14
branch: feat/quantlib-microstructure-type-consolidation
tags: [refactor, tech-debt, quantlib]
blockedBy: []
blocks: []
created: 2026-10-24
---

# QuantLib Microstructure Type-File Consolidation

## Overview

Refactor có giới hạn chặt: gộp các file `*-types.ts` chỉ có **đúng một importer** trong
`src/tree/quantlib/microstructure/` vào module engine/queue tiêu thụ duy nhất đó, giảm số file
production của thư mục mà **không đổi hành vi, không đổi public export set**.

Trần LOC của repo đã chạm đáy (0 file production >120 dòng, lớn nhất 92 dòng), nên "bảo trì chống
trần LOC" không còn việc. Vấn đề đã đảo chiều thành over-fragmentation: trong `microstructure`,
mỗi engine bị tách khỏi file type của chính nó — ở `abdi-ranaldo`, file *mô tả* (17 dòng) còn dài
hơn file *làm việc* (15 dòng). Chi phí thật là điều hướng và diện tích review.

## Muốn đạt được (Goals)

- Ít file hơn trong `microstructure`, mỗi module vừa đủ lớn để tự giải thích.
- Giữ nguyên toàn bộ an toàn đang có: suite xanh, `tsc` sạch, `lint` sạch, `public-sdk.ts` bất biến.

## Done means (quan sát được bằng lệnh)

- `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' | wc -l` giảm từ **132**
  xuống **75** (xoá 57 file `*-types.ts`: 56 cặp có sibling `-engine.ts` + 1 ca queue ở lô 6).
- Số file `*-types.ts` còn lại trong `microstructure` = **6**, và đúng là 6 file trong bảng
  safety gate bên dưới (đối chiếu tên, không chỉ đếm).
- `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' -exec wc -l {} + | awk '$1>120 && $2!="total"'` rỗng;
  file kết quả lớn nhất ≤ **104** dòng (`kyle-adverse-selection`: 83 + 23 − 3 + 1).
- `npm test` → 720 test files / 6.003 tests vẫn pass.
- `npm run type-check` exit 0 không output; `npm run lint -- --max-warnings 0` exit 0.
- `npx knip` không tệ hơn baseline.
- Với **25** file test (`git diff` chỉ chứa đổi đường dẫn import, đúng **1 dòng mỗi file**; 24 file thuộc
  lô 5, 1 file `v13` thuộc lô 6) — tổng ≤ **50** dòng `^[+-]` trong `git diff -- test/`.

## Non-goals

- Không thêm tính năng, không đổi hành vi, API route, hay public export.
- Không nâng hoặc hạ trần 120 LOC.
- Không đụng `src/ee/**` (billing/scheduler), không đổi coverage requirement, không đổi UI/i18n text.
- Không mở rộng sang `src/tree/quantlib/execution/` trong đợt này (ghi lại như follow-up).
- Không đụng 6 file bị safety gate chặn: `abdi-ranaldo-types`, `corwin-schultz-types`,
  `gatheral-transient-impact-types`, `hawkes-jump-types`, `kyle-obizhaeva-invariance-types`,
  `roll-spread-types`.

**Về test layer — đã chốt với người ra quyết định:**

> Không refactor test layer (không tách/ghép test, không đổi assertion). Việc gộp làm đường dẫn
> import của 17 file test đổi; đây là hệ quả cơ học, không phải thay đổi test.

18 trong 57 cặp có thêm một importer trong `test/`. Một khi file types bị `git rm`, đường dẫn đó
treo lơ lửng và `tsc` đỏ — nên phải đổi một dòng `import type {...} from '.../<x>-types'` thành
`from '.../<x>-engine'`. Kiểu vẫn là kiểu cũ, chỉ đổi đường dẫn. 17 cặp engine này đứng trong **lô 5**,
một commit riêng, revert độc lập được.

(Số file trong `test/` thực sự bị đổi là **25**, không phải 17: 8 file `v*` mô phỏng gom nhiều
engine, mỗi file trỏ tới 1 cặp trong đợt này. 24 file thuộc lô 5; file thứ 25,
`v13-full-suite-simulation.test.ts`, import `cont-stoikov-lob-types` nên đi cùng cặp `cont-stoikov-lob`
ở lô 6 — đây là lý do số 24 trong bản trước bị thiếu. Câu trích dẫn trên giữ đúng nguyên văn quyết
định của người ra quyết định; con số 25 ở đây chỉ làm rõ phạm vi đo đạc, không thay đổi quyết định.)

## Constraints

- ADR-001 paper-trading invariant bất biến.
- KISS + DRY, không hardcode secret, commit nhỏ có thể revert, conventional commit không có AI attribution.
- Mỗi lô xác minh trước khi commit.
- Mỗi khẳng định trong plan phải dựa trên lệnh đã chạy (xem Evidence).

## Evidence (đã kiểm chứng)

| Claim | Nguồn |
|---|---|
| 0 file production >120 LOC; lớn nhất 92 (hiện tại 90 sau resize cửa sổ) | `find src ... ! -name '*.test.*' -exec wc -l {} +` |
| `microstructure`: 134 file `.ts`, trong đó 2 file test → **132 production** | `ls *.ts`, `ls *.test.ts` |
| 132 production = **69** file không phải `-types` + **63** file `*-types.ts` | `ls` hai nhóm, đếm tách |
| 63 file `*-types.ts`; **57** có đúng 1 production importer; **6** bị chặn (≥2 importer) | bộ đếm specifier chính xác (xem phase-01) |
| **56** cặp single-importer có sibling `-engine.ts`; cặp thứ 57 là `cont-stoikov-lob` (consumer là `-queue.ts`) | cùng bộ đếm |
| Số file trong `test/` bị đổi là **25**, không phải 24: `v13-full-suite-simulation.test.ts` import `cont-stoikov-lob-types` nên thuộc lô 6, cặp duy nhất không có sibling `-engine.ts` | đếm độc lập bằng script riêng (`from '<spec>'`, basename chính xác) sau khi phát hiện bảng lô 5 thiếu `v13` |
| **Sau gộp còn 75 file production** = 69 + 6 file type bị chặn; xoá đúng 57 file | suy từ hai dòng trên |
| **18** trong 57 cặp có thêm importer trong `test/` (`test/quant/**`) — 17 cặp engine + `cont-stoikov-lob` | cùng bộ đếm, quét cả `test/`, `tests/`, `bin/` |
| 39 cặp còn lại không có consumer trong `test/` | cùng bộ đếm |
| 0 cặp vượt 120 LOC sau gộp; file kết quả lớn nhất **104** (`kyle-adverse-selection`: 83+23−3+1) | tính từng cặp bằng script, rồi đếm tay block import của cả 7 cặp nhiều dòng; ca lô 6: 55+25−4+1 = **77** |
| Cả 63 file type trong `microstructure` thuần type/interface, **0 value export** (0 khớp `^export (const|function|class|enum|let|var|default)`) | grep trên toàn bộ 63 file |
| **0 trùng tên định danh** giữa file types và file engine của nó trong 60 cặp → nối văn bản không gây đụng tên | script so `export interface/type/enum` với mọi khai báo trong engine |
| 2 file test trong thư mục chỉ import engine/kernel, **không** import `*-types` → suite không phải cổng đủ | `grep '^import' *.test.ts` |
| **7** cặp dùng `import type {` trải nhiều dòng (3–5 dòng/cặp) → pattern strip một dòng không khớp | đếm tay từng block import: `kyle-adverse-selection`(3), `kyle-lambda`(5), `stoikov-microprice`(5), `cont-kukanov-placement`(4), `cont-delarrard-queue`(4), `glosten-harris-spread`(4), `cont-stoikov-lob`(4) |
| `tsx` **không** có trong `package.json` và không có trong `node_modules/.bin` | `ls node_modules/.bin` |
| `scripts/` không nằm trong `include` của `vitest.config.ts` → `vitest run scripts/` không gom test nào | đọc `vitest.config.ts` |
| `npx knip` bắt được import treo **và** chỉ đúng consumer trong `test/` | thực nghiệm đã revert; `project: src/**` chỉ giới hạn phạm vi **phân tích**, không giới hạn phạm vi **giải unresolved import** — xoá file types rồi chạy knip, nó in cả 3 consumer: engine trong `src/` + `test/quant/stoikov-microprice-engine.test.ts` + `test/quant/v19-apex-suite-simulation.test.ts` |
| `npm test` là `vitest run`, không có `--coverage` → ngưỡng 100% ở `vitest.config.ts` không bị ép bởi `npm test` | đọc `package.json` |
| Baseline xanh: 720 files / 6.003 tests, `tsc` exit 0, `eslint --max-warnings 0` exit 0 | phiên trước, cần chạy lại ở phase-01 |
| `npx knip` baseline: 14 unused exports, 3 duplicate exports, 6 stale ignoreFiles | phiên trước, đo lại ở phase-01 |

Nguồn lời khuyên đầy đủ: `plans/reports/advise-261024-1146-structural-consolidation-candidate-2.md`
(bản thắng của best-of-5), verdict ở `plans/reports/advise-261024-1146-structural-consolidation-verdict.md`.

Kết quả red-team: `plans/reports/redteam-261025-0125-microstructure-type-consolidation.md`
(1 finding Important đã áp dụng — số file test 24 → 25; 2 claim của reviewer bị bác bảo sau khi
tái hiện lại được).

## Safety gate (luật bất biến)

Chỉ gộp `<x>-types.ts` khi bộ đếm importer trả về **đúng 1 production file**. Bô đếm phải:

1. **Quét cả repo**, tức `src/`, `test/`, `tests/`, `bin/`, `*.config.ts`. Đây là lỗi Critical đã
   bị chặn: phiên bản đầu của bộ đếm chỉ quét `src/` và *loại trừ mọi path chứa `.test.`*, nên 17
   cặp có consumer trong `test/` bị đếm nhầm là an toàn. `vitest.config.ts` gom `test/**`, và
   `tsconfig.json` `include: ["**/*.ts"]` để `test/` vào `tsc --noEmit` — file test vẫn là consumer.
   `npm run lint` chỉ chạy `eslint src/`, nên `test/` còn có 5 lỗi lint sẵn mà cổng này không thấy.
2. **Khớp basename chính xác**, không dùng "đường dẫn kết thúc bằng `<name>`". `stoll-spread-types`
   là hậu tố thật của `huang-stoll-spread-types`, nên test hậu tố sẽ bịa một importer không tồn tại:
   `stoll-spread-types` sẽ bị chặn oan với tên `huang-stoll-spread-engine.ts` trong danh sách
   importer. Đúng ra: (huang:1, stoll:1) chứ không phải (huang:2, stoll:2).
3. **Đếm `import type` nhiều dòng** là một statement, không phải nhiều.
4. **Tách bốn nhóm, và tổng phải = 63**: `blocked` (≥2 production importer), `safe-with-test`
   (1 production + ≥1 trong `test/`), `safe-clean` (1 production, không có trong `test/`),
   `no-engine` (consumer không phải engine). Không stem nào được nằm ở hai nhóm.
   **Thứ tự ưu tiên bắt buộc: `blocked` được xét trước `no-engine`.** `gatheral-transient-impact-types`
   và `hawkes-jump-types` đều có 2 production consumer *và* không có sibling `-engine.ts`; nếu xét
   `no-engine` trước, cả hai sẽ rơi khỏi nhóm bị chặn và trở thành mergeable — đây là lỗi an toàn,
   không phải lệch số liệu. Đo được: bản chưa sửa cho 4 blocked / 0 no-engine; bản đã sửa cho
   **6 blocked / 0 no-engine**, khớp đúng 6 file trong bảng dưới.

Sáu file bị chặn và lý do cụ thể:

| File | Importer (n ≥ 2) |
|---|---|
| `abdi-ranaldo-types.ts` | engine, estimator, `public-sdk.ts` (3) |
| `corwin-schultz-types.ts` | engine, estimator, `public-sdk.ts`, `src/tree/cli/quickstart-fixture.ts` (4) |
| `gatheral-transient-impact-types.ts` | `gatheral-transient-impact.ts`, `alfonsi-lob-resilience.ts` (2) |
| `hawkes-jump-types.ts` | `hawkes-jump-toxicity.ts`, `src/tree/quantlib/portfolio/ledoit-wolf-shrinkage.ts` (2, khác thư mục) |
| `kyle-obizhaeva-invariance-types.ts` | engine, `kyle-obizhaeva-impact-calculator.ts` (2) |
| `roll-spread-types.ts` | `roll-spread-engine.ts`, `roll-effective-spread-engine.ts` (2) |

## Phases

| Phase | Name | Nội dung |
|-------|------|--------|
| 1 | [Safety Gate and Baseline](./phase-01-safety-gate-and-baseline.md) | Bộ đếm quét cả `test/` + đo baseline |
| 2 | [Merge Script](./phase-02-merge-script.md) | Script gộp, strip nhiều dòng, test trên `tmp/` |
| 3 | [Batch Merges](./phase-03-batch-merges.md) | 6 lô; lô 5 là 17 cặp đổi import trong `test/`; lô 6 gồm `cont-stoikov-lob` + `v13` |
| 4 | [Closing Verification](./phase-04-closing-verification.md) | Đo lại 9 chỉ số, so knip |

## Dependencies

- Không có cross-plan dependency.
- Cần `node_modules` ở worktree (đã `npm ci`) để chạy `type-check`/`lint`/`vitest`.
