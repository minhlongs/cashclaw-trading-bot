---
title: "Open-Core Triad Deep Refactor: SaaS API/UI, Test Slicing & Public CLI DX"
description: "Comprehensive 3-phase refactoring connecting ee/ modules to Next.js App Router, slicing test monoliths under 250 LOC, and shipping binary CLI launcher."
status: completed
priority: P1
effort: "3d"
tags: [open-core, saas, api, test-slicing, cli, dx]
created: 2026-10-17
---

# Kế Hoạch Tái Cấu Trúc Toàn Diện Triad: SaaS API/UI + Test Slicing + Public CLI DX

- **Dự án:** CashClaw AI Trading Bot Platform (`/Users/macbook/trade-bot`)
- **Mã kế hoạch:** `261017-1225-opencore-triad-deep-refactor`
- **Phiên bản:** v1.0.0 (Triad Apex)
- **Tình trạng:** Completed (3/3 phases complete, 15/15 tasks)
- **Tiêu chuẩn:** Max 150 LOC/file, Zero `:any`, ADR-001 Paper-Only Invariant, Full Vitest Green.

## Các Giai Đoạn (Phases)

| Giai đoạn | Tiêu đề | Số bước | File chi tiết | Trạng thái |
|---|---|---|---|---|
| **Phase 1** | SaaS API Routes & Server Actions Integration | 5 | [phase-01-saas-api-and-server-actions.md](phase-01-saas-api-and-server-actions.md) | Completed |
| **Phase 2** | Test Suite Deep Slicing & Quality Preservation | 5 | [phase-02-test-suite-deep-slicing.md](phase-02-test-suite-deep-slicing.md) | Completed |
| **Phase 3** | Public SDK Packaging, CLI Binary & DX | 5 | [phase-03-public-sdk-cli-and-dx.md](phase-03-public-sdk-cli-and-dx.md) | Completed |

## Ràng Buộc & Tiêu Chuẩn Kỹ Thuật (Constraints)
1. **ADR-001:** PAPER/BACKTEST ONLY — Không bao giờ phát sinh logic tiền thật.
2. **File Size Management:** Tất cả các module mới và các submodule phân tách đều có LOC <= 150 (nghiêm ngặt < 200).
3. **No Breaking Changes:** Toàn bộ 5,923 tests hiện tại phải tiếp tục pass 100%.
4. **Billing & Secret Safety:** Sử dụng NOWPayments IPN với HMAC-SHA512 WebCrypto; không sử dụng Polar; không commit secret hay env file.
