# CashClaw 25-Step Company Blueprint Task Checklist

**Project:** `~/trade-bot` — CashClaw Industrial Open-Core Algorithmic Trading Framework & Cloud SaaS  
**Baseline Date:** 2026-10-17  
**Status Key:** `[COMPLETED]` (Hoàn thành trong mã nguồn/tài liệu) | `[IN_PROGRESS]` (Đang thực hiện) | `[BLOCKED]` (Chờ điều kiện tiên quyết).

---

## Phase 1 — IP Sanitization & Licensing Boundary (Steps 1–5)
- [x] **Step 1: Secret & Harness Sanitization** `[COMPLETED]`  
  *Artifact:* `.npmignore` (Loại bỏ triệt để `.env`, secrets và test artifacts trước khi xuất bản).
- [x] **Step 2: Dual-License Root Structure** `[COMPLETED]`  
  *Artifact:* `LICENSE` (Apache-2.0 cho OSS Core + Commercial License cho `src/ee/`).
- [x] **Step 3: Enforce Zero-Leak Import Boundary** `[COMPLETED]`  
  *Artifact:* `src/tree/__tests__/open-core-boundary.test.ts` (Gate chống rò rỉ `@/ee` vào core OSS).
- [x] **Step 4: Trademark & Brand Protection Policy** `[COMPLETED]`  
  *Artifact:* `TRADEMARK.md` (Quy định nhãn hiệu CashClaw và tên gọi thương phẩm).
- [x] **Step 5: Contributor & Security Governance** `[COMPLETED]`  
  *Artifact:* `CODE_OF_CONDUCT.md` (Tiêu chuẩn đóng góp và chính sách bảo mật cộng đồng).

---

## Phase 2 — Modular Package Extraction & CLI Experience (Steps 6–10)
- [x] **Step 6: Public QuantLib Barrel (@cashclaw/quantlib)** `[COMPLETED]`  
  *Artifact:* `src/tree/quantlib/public-sdk.ts` (Garman-Klass, Amihud, Roll, Bessembinder-Kaufman).
- [x] **Step 7: Public Alpha Zoo Falsification SDK** `[COMPLETED]`  
  *Artifact:* `src/tree/research/alpha/zoo/public-sdk.ts` (Bộ kiểm định nhân quả causal falsification).
- [x] **Step 8: Standalone Local Single-User Mode** `[COMPLETED]`  
  *Artifact:* `src/lib/edition/edition-mode.ts` (Chế độ độc lập không phụ thuộc Cloud).
- [x] **Step 9: One-Command Local Paper Simulator CLI** `[COMPLETED]`  
  *Artifact:* `bin/cashclaw.js` (CLI `cashclaw quickstart`, `eval`, `steps`).
- [x] **Step 10: Deterministic Demo Seed Dataset** `[COMPLETED]`  
  *Artifact:* `src/tree/cli/quickstart-fixture.ts` (Dữ liệu OHLCV 730 thanh nến mẫu chuẩn hóa).

---

## Phase 3 — SaaS Value Moat & Cloud-Only Architecture (Steps 11–15)
- [x] **Step 11: Multi-Tenant RBAC & Workspace Isolation** `[COMPLETED]`  
  *Artifact:* `src/ee/tenancy/tenant-policy.ts` (Cô lập dữ liệu multi-tenant trên Cloudflare D1).
- [x] **Step 12: 24/7 Durable Cloud Cron Scheduler Coordinator** `[COMPLETED]`  
  *Artifact:* `src/ee/scheduler/cloud-scheduler-coordinator.ts` (Điều phối bot 24/7 không cần máy cá nhân).
- [x] **Step 13: Managed TradingAgents LLM Credit Ledger** `[COMPLETED]`  
  *Artifact:* `src/ee/deliberation-cloud/llm-credit-ledger.ts` (Quản lý credit và hạn mức suy luận LLM).
- [x] **Step 14: Cloud Alpha Registry & Curated IC/IR Feed** `[COMPLETED]`  
  *Artifact:* `src/ee/alpha-cloud/alpha-feed-service.ts` (Dòng dữ liệu tín hiệu Alpha được tinh tuyển).
- [x] **Step 15: Real-Time Alerting & Webhook Cloud Dispatcher** `[COMPLETED]`  
  *Artifact:* `src/ee/alerts/cloud-alert-dispatcher.ts` (Bộ phát cảnh báo qua Telegram/Discord/Webhook).

---

## Phase 4 — SaaS Billing Quotas & Conversion Funnel (Steps 16–20)
- [x] **Step 16: 4-Tier SaaS Entitlement Schema** `[COMPLETED]`  
  *Artifact:* `src/ee/billing/tier-entitlements.ts` (BASIC $0, PREMIUM $29, ENTERPRISE $99, MASTER $299).
- [x] **Step 17: Quota & Concurrency Enforcement Middleware** `[COMPLETED]`  
  *Artifact:* `src/ee/billing/quota-guard.ts` (Chặn vượt ngưỡng bot, cron frequency và API rate).
- [x] **Step 18: NOWPayments IPN Webhook & Crypto Billing Engine** `[COMPLETED]`  
  *Artifact:* `src/ee/billing/nowpayments-ipn.ts` (Xử lý thanh toán tiền số tự động, chống replay).
- [x] **Step 19: BYOK vs. Managed Key Router** `[COMPLETED]`  
  *Artifact:* `src/ee/billing/key-mode-router.ts` (Định tuyến khóa API người dùng tự cung cấp hoặc Cloud).
- [x] **Step 20: 1-Click Local-to-Cloud Sync Bridge** `[COMPLETED]`  
  *Artifact:* `src/ee/sync/local-to-cloud-sync.ts` (Xuất cấu hình có chữ ký SHA-256 từ CLI lên SaaS).

---

## Phase 5 — Open-Source Growth Engine & CI Governance (Steps 21–25)
- [x] **Step 21: GitHub Actions Public CI Quality Gate** `[COMPLETED]`  
  *Artifact:* `.github/workflows/open-core-ci.yml` (CI tự động kiểm định ranh giới Open-Core và typecheck).
- [x] **Step 22: Bilingual README & OSS vs. Cloud Comparison Table** `[COMPLETED]`  
  *Artifact:* `docs/open-core-saas-architecture.md` (Bảng so sánh chi tiết tính năng Community vs Cloud).
- [x] **Step 23: Community Alpha Hypothesis PR Template** `[COMPLETED]`  
  *Artifact:* `.github/ISSUE_TEMPLATE/alpha-hypothesis.md` (Mẫu đề xuất ý tưởng Alpha chuẩn khoa học).
- [x] **Step 24: Release Versioning & SDK Package Metadata** `[COMPLETED]`  
  *Artifact:* `package.json` (Cấu hình gói `@cashclaw/core` và CLI công khai).
- [x] **Step 25: Privacy-First SaaS Telemetry & Conversion Funnel Metrics** `[COMPLETED]`  
  *Artifact:* `src/ee/telemetry/conversion-funnel.ts` (Đo lường phễu chuyển đổi PQL bảo vệ quyền riêng tư).
