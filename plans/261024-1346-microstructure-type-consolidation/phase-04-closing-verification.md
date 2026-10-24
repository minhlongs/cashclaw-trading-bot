---
title: "Phase 4: Closing-Verification"
status: todo
---

# Phase 4: Closing-Verification

## Overview

Đo lại toàn bộ Done-means một lần ở trạng thái cuối, so với baseline phase 01, và ghi chênh lệch
thành deviation nếu có. Phase này không sửa code — nếu một chỉ số lệch, nó **báo cáo**, không nắn
số cho khớp.

**Key Insights**

- Phải so với `baseline-sha.txt`, không phải với con số trong plan, vì plan kỳ vọng 75 nhưng con số
  thật phải từ lệnh.
- `knip` có thể **cải thiện** (ít export hơn sau khi gộp) — đó là tốt, không phải lệch cần xử lý.
  Chỉ báo động nếu nó **tệ hơn**.
- Suite xanh chưa đủ. Chỉ số quan trọng nhất vẫn là "6 file blocked, không file nào khác" vì nó
  chứng minh safety gate còn sống sau toàn bộ đợt.

## Requirements

- [ ] Functional: đo lại 9 chỉ số Done-means, ghi từng lệnh và kết quả thật.
- [ ] Functional: so knip với baseline, phân loại better / worse.
- [ ] Functional: nếu số file cuối ≠ 75, ghi làm Plan Deviation kèm giải thích, không sửa số.
- [ ] Non-functional: không sửa bất kỳ file source nào trong phase này.

## Architecture

```
closing report (plans/reports/consolidation-closing.md)
   ├── 9 done-means measurements (command + actual output)
   ├── knip delta vs baseline
   └── deviations (or "None")
```

## Related Code Files

| File | Hành động | Mô tả |
|---|---|---|
| `plans/reports/baseline-gates.txt` | Read | Mốc phase 01 |
| `plans/reports/knip-baseline.txt` | Read | Mốc knip phase 01 |
| `plans/reports/consolidation-closing.md` | Create | Báo cáo đóng cửa |
| `plans/261024-1346-microstructure-type-consolidation/plan.md` | Modify | Cập nhật status + ghi deviation |

Không file trong `src/` bị sửa trong phase này.

## Implementation Steps

1. **Đếm file.**
   `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' | wc -l`
   Ghi số thật, kỳ vọng 75 (69 file không phải type + 6 file type bị chặn).
2. **Đếm file types còn lại.**
   `ls src/tree/quantlib/microstructure/*-types.ts | grep -v '\.test\.' | wc -l` → kỳ vọng 6 (đối chiếu tên với danh sách bị chặn).
3. **Verify chính xác là 6 file nào.** Đối chiếu danh sách bằng tay với 6 file bị chặn trong `plan.md`.
   Nếu xuất hiện file ngoài danh sách → **đó là lỗi, không phải deviation**; dừng và báo cáo.
4. **Kiểm trần.**
   `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' -exec wc -l {} + | awk '$1>120 && $2!="total"'` → phải rỗng.
5. **File lớn nhất.**
   `find src/tree/quantlib/microstructure -name '*.ts' ! -name '*.test.*' -exec wc -l {} + | awk '$2!="total"' | sort -rn | head -1`
   → ≤ **104**. Dùng `awk '$2!="total"'` trước `sort` để hai lệnh ở bước 4 và bước 5 cùng một niềm
   tin về output; kỳ vọng đo được chính xác là `104 kyle-adverse-selection-engine.ts`
   (83 + 23 − 3 dòng import + 1 dòng trống). Con số 110 trong bản thảo cũ **không có nguồn** — nó
   lỏng hơn đo đạc 4 dòng, nên pass mà không chứng minh gì.
6. **Export set SDK bất biến.**
   `git diff $(cat plans/reports/baseline-sha.txt) HEAD -- src/tree/quantlib/public-sdk.ts | wc -l` → **0**.
   **Biết trước rằng lệnh này không thể fail**: `public-sdk.ts` re-export duy nhất 2 file type
   (`abdi-ranaldo-types`, `corwin-schultz-types`), cả hai đều bị safety gate chặn. Nó ghi 0 ở mọi
   trạng thái. Nó ở đây như dấu ấn rẻ tiền, **không** phải bằng chứng export set an toàn.
   Bằng chứng thật là 3 dòng cuối của `npx knip` (so với baseline) và cổng `type-check` mỗi lô.
7. **Cổng xanh đầy đủ.**
   `npm run type-check` (exit 0, no output); `npm run lint -- --max-warnings 0` (exit 0);
   `npm test` (720 files / 6.003 tests). Ghi dòng tóm tắt thật của vitest.
8. **So knip.**
   `npx knip > /tmp/knip-final.txt 2>&1; echo "exit=$?" >> /tmp/knip-final.txt`
   rồi so số finding với `plans/reports/knip-baseline.txt`. Ghi better/worse/equal kèm ví dụ
   export nào biến mất.
9. **Thêm chỉ số thứ 9 — chỉ có ở đợt này.** `git diff <baseline> HEAD -- test/ | grep -c '^[+-]'`
   → ≤ **50** (25 xoá + 25 thêm, một đổi một). Số 34 trong bản thảo cũ suy từ "17 file test", nhưng
   đo thật cho **25** file `test/quant/` bị đổi, mỗi file đúng 1 dòng import (17 cặp + 8 file
   `v*` mô phỏng gom nhiều engine). Nếu lớn hơn 50, tức có assertion hoặc test bị đổi — dừng và
   điều tra, **không** ghi thành deviation để đi qua.
10. **Viết `plans/reports/consolidation-closing.md`** với bảng 9 chỉ số: tên chỉ số, lệnh, kỳ vọng,
    kết quả thật, pass/fail.
11. **Cập nhật `plan.md`**: status → `completed`, và ghi Plan Deviations (hoặc `None`) ở cuối file.
12. **Đề xuất tiếp theo (ghi, không làm).** `src/tree/quantlib/execution/` cùng hình dạng
    (37 file type + 38 non-type); và **154** file `*-types.ts` ngoài `microstructure`, trong đó có
    **13 file chứa value export** (ví dụ `circuit-breaker-types.ts` có
    `export class CircuitOpenError extends Error`) — nhóm này **không** gộp cơ học được, cần thiết
    kế riêng. Ghi vào roadmap như đề xuất, không tự làm.

## Tests Before

- [ ] Xác nhận `plans/reports/baseline-gates.txt` đọc được và số baseline đúng 720/6.003
      (nếu không, phase 03 đã chạy trên mốc sai — điều tra trước khi viết báo cáo).

## Refactor

Không có — phase này chỉ đo và ghi.

## Tests After

- [ ] Báo cáo đóng cửa tồn tại với 9 dòng kết quả thật, không dòng nào để trống.

## Regression Gate

```bash
npm run type-check        # exit 0, no output
npm run lint -- --max-warnings 0   # exit 0
npm test                  # 720 files / 6003 tests
npx knip                  # no worse than baseline
```

## Success Criteria

- [ ] `plans/reports/consolidation-closing.md` tồn tại, 9 chỉ số đều có kết quả thật.
- [ ] Mọi chỉ số pass, hoặc mỗi chỉ số fail có deviation ghi rõ nguyên nhân.
- [ ] `plan.md` status = `completed`, deviations ghi đủ.
- [ ] Không có file source bị sửa trong phase này (`git status --short` rỗng ở đầu phase và chỉ thêm
      artifact ở `plans/`).
- [ ] Đề xuất `execution/` + nhóm 21 value-export file được ghi vào roadmap, không bị làm ngầm.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Nắn số để khớp 75 | Chỉ ghi kết quả lệnh thật; lệch ghi deviation |
| Nhầm danh sách 6 file bị chặn | Đối chiếu bằng tay ở bước 3, không chỉ đếm |
| `sort -rn | sed -n '2p'` nhận nhầm dòng `total` | Dùng `awk '$2!="total"'` trước `sort` ở cả hai lệnh; khớp kỳ vọng với 104 đã tính |
| knip "worse" do nguyên nhân cũ sẵn | So đúng file baseline, phân loại finding theo loại |

## Security Considerations

Không đổi bề mặt auth/billing. Không ghi secret vào báo cáo. Output `npx knip` chỉ là tên export,
không chứa giá trị nhạy cảm.

## Next Steps

Plan hoàn tất → chuyển sang `/ak:cook --tdd --auto` nếu phase 1–4 chưa chạy qua cook, hoặc chuyển
sang code review + ship trong vibe pipeline.
