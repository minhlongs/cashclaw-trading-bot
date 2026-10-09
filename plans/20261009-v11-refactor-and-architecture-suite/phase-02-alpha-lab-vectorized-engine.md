# Phase 2: Alpha Lab Consolidation & Vectorized Research Engine

## Context Links
- Plan: [plan.md](./plan.md)
- Specs: [docs/brainstorming-v11-refactor-architecture.md](../../docs/brainstorming-v11-refactor-architecture.md)
- Existing Modules: `src/tree/alpha/factors/ic-analysis.ts`, `src/forest/alpha/pipeline/engine.ts`

## Overview
- Priority: High
- Status: pending
- Target: `src/tree/research/vectorized/vectorized-factor-types.ts`, `src/tree/research/vectorized/vectorized-factor-engine.ts`, `src/tree/research/vectorized/index.ts`, và `src/tree/research/vectorized/vectorized-factor-engine.test.ts`

## Requirements
- Chuyển đổi tính toán chuỗi thời gian factor sang cấu trúc mảng dẹt `Float64Array`.
- Thuật toán tính nhanh Pearson & Spearman rank correlation không cấp phát mảng phụ.
- Tính toán Information Coefficient (IC), Information Ratio (IR) và Quantile Spread nhanh gấp 10x-30x.
- Xử lý mượt mà dữ liệu NaN/Inf mà không làm gián đoạn chuỗi dữ liệu.

## Related Code Files
- Tạo mới: `src/tree/research/vectorized/vectorized-factor-types.ts` ($\le 60$ LOC)
- Tạo mới: `src/tree/research/vectorized/vectorized-factor-engine.ts` ($\le 120$ LOC)
- Tạo mới: `src/tree/research/vectorized/index.ts` ($\le 10$ LOC)
- Tạo mới: `src/tree/research/vectorized/vectorized-factor-engine.test.ts` ($\le 120$ LOC)

## Success Criteria
- 100% test coverage trên `vectorized-factor-engine.ts`.
- Sai số kết quả so với module IC truyền thống $< 10^{-6}$.
- 0 `:any`, 0 `console.log`.
