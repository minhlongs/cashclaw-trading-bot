---
title: "CashClaw 25-Step Open-Core & Cloud SaaS Company Blueprint"
description: "Chiến lược và lộ trình kỹ thuật từ dự án mã nguồn mở Apache-2.0 đến nền tảng Cloud SaaS $1M ARR"
status: completed
priority: P1
effort: "26w"
branch: main
tags: [cashclaw, open-core, apache-2.0, saas, quantlib, nowpayments, cloudflare-workers]
created: 2026-10-17
---

# CashClaw — 25-Step Company Blueprint (Open-Core & Cloud SaaS)

**Giai đoạn / Stage:** Production Open-Core v1.62.0 → $1M ARR Scale  
**Mô hình / Model:** Apache-2.0 Community Core + Proprietary Cloud SaaS (`src/ee/`)  
**Bất biến an toàn / Safety Invariant:** ADR-001 (`PAPER / BACKTEST ONLY` — 0 rủi ro mất vốn thật)  
**Đối tượng mục tiêu / ICP:** Nhà giao dịch định lượng cá nhân, nhóm nghiên cứu học thuật, và quỹ định lượng nhỏ cần hạ tầng kiểm định nhân quả (causal falsification) & vận hành 24/7 trên Cloudflare Edge.

---

## 1. Cấu trúc Mô hình Kinh doanh (Dual-License Business Model)

```text
Community Edition (Apache-2.0)               Cloud SaaS Edition (Commercial License)
──────────────────────────────────────       ───────────────────────────────────────────
- QuantLib (Garman-Klass, Amihud, Roll)      - BASIC ($0/tháng): 1 bot, 60m cron
- Vibe-Trading Alpha Zoo Falsification       - PREMIUM ($29/tháng): 5 bots, 5m cron, Cloud Alpha
- Local SQLite Paper Engine (1 User)         - ENTERPRISE ($99/tháng): 25 bots, 1m cron, Audit
- CLI `cashclaw` (quickstart, eval, steps)   - MASTER ($299/tháng): 100 bots, Dedicated Edge
- 1-Click Export Bundle (`export-sync`)      - NOWPayments IPN Crypto + Stripe Billing
```

---

## 2. Vòng lặp Tăng trưởng (Product-Led Growth Flywheel)

```text
GitHub Clone / `npx cashclaw quickstart` (60s)
      │
      ▼
Nghiên cứu Alpha & Chạy giả lập Paper Local (`cashclaw eval`)
      │
      ▼
Chạm ngưỡng giới hạn máy cá nhân (tắt máy mất tick, thiếu LLM credits, cần 24/7)
      │
      ▼
Xuất gói cấu hình có chữ ký SHA-256 (`cashclaw export-sync`)
      │
      ▼
1-Click Import lên CashClaw Cloud SaaS & Thanh toán tự động qua NOWPayments IPN
```

---

## 3. Ma trận 5 Giai đoạn Thực thi (25-Step Architecture Matrix)

| Phase | Tên Giai đoạn | Phạm vi Bước | Trạng thái |
|---|---|---|---|
| **Phase 1** | IP Sanitization & Licensing Boundary | Steps 1–5 | `COMPLETED` (5/5) |
| **Phase 2** | Modular Package Extraction & CLI Experience | Steps 6–10 | `COMPLETED` (5/5) |
| **Phase 3** | SaaS Value Moat & Cloud-Only Architecture | Steps 11–15 | `COMPLETED` (5/5) |
| **Phase 4** | SaaS Billing Quotas & Conversion Funnel | Steps 16–20 | `COMPLETED` (5/5) |
| **Phase 5** | Open-Source Growth Engine & CI Governance | Steps 21–25 | `COMPLETED` (5/5) |

---

## 4. Cột mốc Doanh thu & Kinh tế Đơn vị ($1M ARR Milestones)

| Cột mốc | Mục tiêu Kỹ thuật & Tăng trưởng | Chỉ số Bắc Đẩu (North Star) |
|---|---|---|
| **M0 (Baseline)** | Hoàn tất 25/25 bước Open-Core & Ranh giới `open-core-boundary.test.ts` | 100% Tests Green, 0 Leak |
| **M1 (Community)** | Phát hành gói `@cashclaw/quantlib` & CLI `cashclaw` trên GitHub Public | 1,000+ GitHub Stars, 500 CLI runs/tuần |
| **M2 (Conversion)** | Kênh chuyển đổi `export-sync` → Cloud SaaS + NOWPayments IPN | Tỷ lệ chuyển đổi PQL ≥ 4.5% |
| **M3 (Expansion)** | Ra mắt Cloud Alpha Feed & Managed LLM Deliberation Credits | $25,000 MRR (~300 trả phí) |
| **M4 (Scale)** | Đạt chuẩn Enterprise RBAC & Multi-Tenant Isolation trên Cloudflare D1 | $83,333 MRR ($1M ARR) |

---

## 5. Liên kết Hồ sơ Quản trị (Governance Links)

- **Tasks Checklist (25 Steps):** [`plans/company-blueprint/tasks.md`](./tasks.md)
- **Company Manifest:** [`.mekong/company.json`](../../.mekong/company.json)
- **25-Step Code Catalog:** [`src/ee/catalog/open-core-25-steps-catalog.ts`](../../src/ee/catalog/open-core-25-steps-catalog.ts)
- **Detailed Restructuring Plan:** [`plans/261017-1159-open-core-public-github-and-cloud-saas-25-step-restructuring/plan.md`](../261017-1159-open-core-public-github-and-cloud-saas-25-step-restructuring/plan.md)
