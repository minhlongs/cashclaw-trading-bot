# CashClaw 4-Pillar Strategic Plan: SaaS APIs, UI Dashboard, OSS Packaging, Security & Stress Audit

> **Bối cảnh:** Sau khi hoàn thành và đồng bộ 25 bước Open-Core & Cloud SaaS Blueprint (`.mekong/company.json` và `plans/company-blueprint/`), kế hoạch này triển khai chi tiết 4 trụ cột chiến lược nhằm đưa CashClaw từ nền tảng cục bộ sang sẵn sàng vận hành $1M ARR SaaS.

---

## Pillar 1 — Cloud SaaS API Expansion (`src/app/api/ee/`)
1. **Alpha Feed Route (`/api/ee/alpha-feed`)**: Tích hợp `AlphaFeedService` với kiểm tra tier tối thiểu `PREMIUM`.
2. **LLM Credit Ledger Route (`/api/ee/credits`)**: Cung cấp số dư, nạp credit và trừ token cho `TradingAgents` deliberation.
3. **Cloud Alert Route (`/api/ee/alerts`)**: Quản lý kênh webhook Telegram/Discord và kích hoạt cảnh báo thử nghiệm.
4. **Cloud Scheduler Route (`/api/ee/scheduler`)**: Quản lý lịch cron 24/7 của các paper bot theo hạn mức tier.
5. **Telemetry Route (`/api/ee/telemetry`)**: Ghi nhận các sự kiện PQL (Product-Qualified Lead) không thu thập dữ liệu nhạy cảm.

## Pillar 2 — SaaS Dashboard UI & Billing Modal (`src/app/[locale]/(dashboard)/billing`)
1. **Bảng so sánh 4 Tiers**: Hiển thị rõ giá ($0, $29, $99, $299), số bot (1, 5, 25, 100), tần suất cron (60m, 5m, 1m).
2. **Quota Usage Widget**: Thống kê số bot đang chạy vs hạn mức, cron frequency, số credit LLM còn lại.
3. **NOWPayments Checkout Modal**: Hỗ trợ thanh toán crypto tức thì, cập nhật trạng thái gói dịch vụ.
4. **1-Click Sync Bridge UI**: Hướng dẫn copy token/chữ ký để kết nối từ CLI `cashclaw export-sync` lên Cloud.

## Pillar 3 — Public OSS Packaging & Release Pipeline
1. **Cấu hình Package Export**: Thiết lập bundle cho `@cashclaw/quantlib` trong `package.json` để sẵn sàng publish.
2. **CLI Entrypoint Verification**: Kiểm tra `bin/cashclaw.js` hoạt động độc lập không bị dính dependency từ `src/ee/`.
3. **Open-Core License Boundary Gate**: Đảm bảo toàn bộ gói public tuân thủ Apache-2.0 và không rò rỉ mã thương mại.

## Pillar 4 — Security & Falsification Stress Audit
1. **Security Audit**: Kiểm tra anti-IDOR, tenant isolation, chống replay IPN webhook, mã hóa khóa API.
2. **Invariant Stress Audit**: Đảm bảo 100% ADR-001 (Paper/Backtest Only), không thể vô tình sinh lệnh giao dịch tiền thật.
3. **Regression Test Suite**: Bổ sung bộ test tích hợp cho toàn bộ các endpoint và UI components mới tạo.
