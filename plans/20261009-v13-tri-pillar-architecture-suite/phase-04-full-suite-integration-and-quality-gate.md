# Phase 04: Full-Suite Integration & Quality Gate

## Overview
- **Priority**: High
- **Status**: Pending
- **Goal**: Xây dựng kịch bản kiểm thử tích hợp liên trụ cột v13 (`test/quant/v13-full-suite-simulation.test.ts`), chạy toàn bộ test suite và build production.

## Scope
1. **Integration Test Suite**:
   - Khởi tạo LOB depth với Cont-Stoikov engine tính xác suất fill & Micro-Price.
   - Chạy giả thuyết qua `VectorizedFactorEngine` và chuyển kết quả vào `deliberation-reflexive-loop`.
   - Xác nhận niềm tin (Agent Belief Prior) cập nhật chính xác trước khi định tuyến lệnh qua Waterfall OMS đã refactor.
2. **Quality Gates**:
   - Toàn bộ test suite pass 100% (>5,475 tests).
   - TypeScript compiler (`npx tsc --noEmit`) đạt 0 lỗi.
   - Next.js build (`npm run build`) thành công rực rỡ.
   - Cập nhật tài liệu `docs/project-changelog.md` và memory index.
