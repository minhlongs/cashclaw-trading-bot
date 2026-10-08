# Phase 02: Microstructure Flow Toxicity & Hawkes Point Process Desk

## Context & Objectives
Triển khai công cụ đo lường độc hại dòng lệnh và mô hình tự kích hoạt Hawkes tại `src/tree/quantlib/toxicity/`:
1. `toxicity-types.ts`: Định nghĩa các kiểu dữ liệu cho Continuous VPIN, Hawkes Event và Whale Sweep Signals.
2. `continuous-vpin-streamer.ts`: Thuật toán VPIN cửa sổ trượt (sliding volume buckets) xác định xác suất dòng lệnh độc hại $VPIN \in [0, 1]$.
3. `hawkes-process-detector.ts`: Mô hình Hawkes tự kích hoạt giải tích $\lambda(t) = \mu + \sum \alpha e^{-\beta(t - t_i)}$ phát hiện chùm bùng nổ lệnh.
4. Unit test suite `toxicity.test.ts` đạt 100% test coverage.

## Todo List
- [ ] Tạo `src/tree/quantlib/toxicity/toxicity-types.ts` (<= 100 LOC)
- [ ] Tạo `src/tree/quantlib/toxicity/continuous-vpin-streamer.ts` (<= 120 LOC)
- [ ] Tạo `src/tree/quantlib/toxicity/hawkes-process-detector.ts` (<= 130 LOC)
- [ ] Tạo `src/tree/quantlib/toxicity/toxicity.test.ts` (<= 140 LOC)
- [ ] Chạy vitest xác minh 100% test pass.
