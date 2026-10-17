# Phase 2: Test Suite Deep Slicing & Quality Preservation

**Mục tiêu:** Cắt nhỏ các test suite kích thước khổng lồ (>500 LOC) thành các submodule chuyên biệt (< 250 LOC) nhằm tăng tốc độ thực thi, tăng độ rõ ràng và giảm nợ kỹ thuật.

## Danh sách công việc (Tasks)
- [x] task-06: Phân tách `bot-manager.test.ts` (1,022 LOC) thành 4 sub-suites chuyên biệt (lifecycle, queue, persistence, errors)
- [x] task-07: Phân tách `funding.test.ts` (696 LOC) thành 3 sub-suites tính toán tín hiệu và regime shifts
- [x] task-08: Phân tách `dashboard-client.test.tsx` (642 LOC) thành các test suite thành phần UI
- [x] task-09: Phân tách `daily-stats.test.ts` (624 LOC) thành các test suite handler dữ liệu
- [x] task-10: Chạy kiểm thử toàn bộ hệ thống (`npm test`), xác nhận toàn bộ test passes và thời gian thực thi được tối ưu

## Chi tiết kỹ thuật
- Giữ nguyên tất cả các assertions và edge cases gốc.
- Không bỏ qua bất kỳ test case nào để vượt qua chất lượng.
- Giữ sạch sẽ mock scope cho từng test runner.
