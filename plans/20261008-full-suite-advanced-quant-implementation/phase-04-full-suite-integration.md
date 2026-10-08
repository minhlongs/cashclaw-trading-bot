# Phase 04: End-to-End Cross-Stack Integration & Quality Gates

## Context Links
- Plan Overview: `plans/20261008-full-suite-advanced-quant-implementation/plan.md`
- Phases: `phase-01-cross-venue-delta-hedger.md`, `phase-02-l2-ofi-toxicity-alpha.md`, `phase-03-fleet-risk-commander-hrp.md`
- E2E Test Suite: `test/e2e/`

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Tích hợp kiểm thử trọn vẹn toàn bộ chu trình Full Suite từ vi cấu trúc (L2 OFI/VPIN), vị thế phòng hộ (Delta Hedger), đến phân bổ vốn danh mục (Fleet Risk Commander) qua bài test E2E thực tế.

## Architecture & Verification Flow
1. **L2 Flow to Alpha:** Nạp chuỗi sổ lệnh L2 $\to$ OFI/VPIN phát hiện áp lực mua/bán bất cân xứng $\to$ sinh tín hiệu định lượng.
2. **Delta-Neutral Execution:** Mở vị thế 2 chân trên Binance/OKX $\to$ theo dõi delta drift $\to$ kích hoạt tái cân bằng tự động qua L2 simulator.
3. **Fleet Allocation & Circuit Breaker:** HRP phân bổ vốn động $\to$ kiểm tra phản ứng khi giả lập cú sốc danh mục vượt ngưỡng drawdown.
4. **Quality Gates:** Chạy kiểm tra toàn diện TypeScript compiler, Vitest, Linting, và Gitleaks.

## Related Code Files
- `test/e2e/full-suite-advanced-quant.test.ts` (Create)
- `docs/project-changelog.md` (Update)
- `docs/development-roadmap.md` (Update)

## Success Criteria
- Test E2E vượt qua 100% với kịch bản tích hợp đầy đủ cả 3 trụ cột.
- Toàn bộ suite test hiện hữu (> 4,140 tests) tiếp tục xanh (0 regressions).
- 0 lỗi compile TypeScript (`npx tsc --noEmit`), 0 ESLint warnings.
- Không có bất kỳ vi phạm nào đối với ADR-001 (paper-only).
