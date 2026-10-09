---
status: pending
version: 13.0.0
title: "Triad v13 Architecture: Cont-Stoikov LOB Queue Dynamics, Closed-Loop Alpha Deliberation & Fat-File Modularization"
created: 2026-10-09
---

# Plan: Triển Khai Kiến Trúc Triad v13 & Tái Cấu Trúc Toàn Diện

## Tổng quan
Kế hoạch triển khai toàn diện v13 nâng cấp hệ thống CashClaw trên cả 3 phương diện:
1. **Vi cấu trúc & Hàng đợi LOB**: Mô hình Markovian Cont-Stoikov ước lượng xác suất khớp lệnh và Micro-Price nhạy OFI.
2. **Khép kín vòng lặp Deliberation Alpha**: Cơ chế phản hồi Bayesian niềm tin (Agent Belief Prior updates) từ kiểm định Factor/Gate về debate agents.
3. **Tái cấu trúc Fat-Files & Tối ưu hóa LOC**: Phân rã các file >170 LOC về chuẩn $\le 140$ LOC, bảo toàn 100% backward compatibility.
4. **Tích hợp & Kiểm thử toàn diện**: E2E simulation và bảo toàn toàn bộ 5,464+ test cases xanh 100%.

## Danh sách Phases
- [ ] [Phase 01: Cont-Stoikov LOB Queue Dynamics & Micro-Price](./phase-01-cont-stoikov-lob-queue.md)
- [ ] [Phase 02: Closed-Loop Reflexive Alpha Deliberation](./phase-02-closed-loop-reflexive-alpha-deliberation.md)
- [ ] [Phase 03: Fat-Files Modularization & LOC Optimization](./phase-03-fat-files-modularization.md)
- [ ] [Phase 04: Full-Suite Integration & Quality Gate](./phase-04-full-suite-integration-and-quality-gate.md)

## Tiêu chí hoàn thành (Definition of Done)
1. Tất cả các file mã nguồn $\le 140$ LOC, 0 `:any`, 0 ESLint warnings.
2. 100% test coverage trên các module mới và duy trì tổng cộng 5,475+ test pass (100% green).
3. Paper-only safety invariant (ADR-001) và WebCrypto thuần tuý được bảo toàn 100%.
4. Next.js build (`npm run build`) và TypeScript check (`npx tsc --noEmit`) đạt 100% không lỗi.
