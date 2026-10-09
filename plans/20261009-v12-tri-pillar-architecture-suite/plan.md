---
status: completed
version: 12.0.0
title: "Triad v12 Architecture: Kyle-Back Adverse Selection, Bayesian Black-Litterman & Terminal Waterfall HUD"
created: 2026-10-09
completed: 2026-10-09
---

# Plan: Triển Khai Kiến Trúc Triad v12

## Tổng quan
Kế hoạch triển khai toàn diện v12 nâng cấp hệ thống CashClaw trên cả 3 phương diện:
1. **Microstructure & Execution**: Kyle-Back adverse selection lambda, adaptive U-curve volume slicing, và dynamic-cost smart order routing.
2. **Bayesian Alpha & Portfolio**: Black-Litterman Bayesian portfolio optimization tích hợp LLM view, Gram-Schmidt factor orthogonalization, Equal Risk Contribution optimizer.
3. **HUD Terminal & Telemetry**: Terminal Waterfall HUD, Post-Trade Slippage Attribution Ledger, và E2E multi-pillar simulation.

## Danh sách Phases
- [x] [Phase 01: Kyle Microstructure & Adaptive OMS](./phase-01-kyle-microstructure-and-adaptive-oms.md)
- [x] [Phase 02: Bayesian Black-Litterman & Factor Orthogonalization](./phase-02-bayesian-black-litterman-and-orthogonalization.md)
- [x] [Phase 03: Terminal Waterfall HUD & Slippage Attribution](./phase-03-terminal-waterfall-hud-and-slippage-attribution.md)
- [x] [Phase 04: Full-Suite Simulation & Verification](./phase-04-full-suite-integration-and-verification.md)

## Tiêu chí hoàn thành (Definition of Done)
1. Tất cả các file mã nguồn $\le 160$ LOC, 0 `:any`, 0 ESLint warnings.
2. 100% test coverage trên các module quant mới và duy trì tổng cộng 5,464 test pass (100% green).
3. Paper-only safety invariant và WebCrypto thuần tuý được bảo toàn 100%.
4. Next.js build (`npm run build`) và TypeScript check (`npx tsc --noEmit`) đạt 100% không lỗi.

