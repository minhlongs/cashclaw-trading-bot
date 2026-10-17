# CashClaw Open-Core & Cloud SaaS Architecture (VI / EN)

> **Bản quyền kép (Dual-Layer Licensing):** Lõi định lượng & giả lập giao dịch (`src/tree/`, `src/land/`) được phát hành công khai theo giấy phép **Apache-2.0**. Tầng vận hành đám mây đa thuê bao, lập lịch 24/7, ví tín dụng LLM và thanh toán NOWPayments (`src/ee/`) thuộc bản quyền thương mại **CashClaw Enterprise Edition (EE)**.

---

## 1. 🇻🇳 Tổng quan Mô hình Open-Core (Dành cho Nhà đầu tư & Kỹ sư)

CashClaw áp dụng mô hình **Open-Core (giống GitLab / Supabase / PostHog)**:
- **Tại sao mở mã nguồn `src/tree/` và `src/land/` (Apache-2.0)?**
  Các nhà giao dịch định lượng (Quant) và lập trình viên không tin tưởng các "hộp đen" (black-box). Việc công khai toàn bộ hơn 60 mô hình định lượng (Corwin-Schultz, Almgren-Chriss, Garman-Klass, Alpha Zoo 17-op AST, bộ kiểm định giả thuyết IC/IR và bộ giả lập khớp lệnh Paper-Only ADR-001) giúp dự án thu hút GitHub Stars, PR đóng góp nhân tố Alpha mới và xây dựng uy tín minh bạch tuyệt đối.
- **Tại sao người dùng vẫn trả tiền thuê bao Cloud SaaS (`src/ee/`)?**
  Chạy backtest 1 lần trên laptop bằng CLI thì miễn phí, nhưng để **vận hành danh mục Paper/Shadow Bot 24/7 không gián đoạn trên hạ tầng Cloudflare Workers + D1**, nhận **tín hiệu Alpha đã tính sẵn mỗi giờ**, sử dụng **Managed Multi-Agent LLM Deliberation** không cần tự quản lý nhiều API key, và nhận **cảnh báo Telegram/Discord tức thì**, khách hàng nâng cấp lên các gói **PREMIUM / ENTERPRISE / MASTER** chỉ với 1 cú nhấp chuột (`1-Click Local-to-Cloud Sync`).

---

## 2. 🇬🇧 Architecture & Licensing Boundary

| Layer / Directory | License | Responsibility | npm Published |
|---|---|---|---|
| `src/tree/**` | **Apache-2.0** | Pure quantitative engines (`quantlib`), Alpha Zoo parser/evaluator, OHLCV quality gates, paper exchange simulator (`ADR-001`) | Yes (`@cashclaw/quantlib`, `@cashclaw/alpha-zoo`) |
| `src/land/**` | **Apache-2.0** | Single-user local bot orchestration & provider chains | Yes |
| `src/lib/edition/**` | **Apache-2.0** | Runtime edition detector (`OSS_LOCAL` default vs `CLOUD_SAAS`) | Yes |
| `src/ee/**` | **CashClaw Commercial** | Multi-tenant RBAC, 24/7 Cloud Scheduler leases, Managed LLM Credit Ledger, Curated Alpha Feed, NOWPayments IPN Billing, 1-Click Cloud Sync | Excluded via `.npmignore` |

### Strict Dependency Rule
- `src/tree/**` and `src/land/**` **MUST NEVER** import from `src/ee/**`.
- Enforced automatically on every push and pull request by `src/tree/__tests__/open-core-boundary.test.ts` and `.github/workflows/open-core-ci.yml`.

---

## 3. SaaS Tier Entitlements (`BASIC | PREMIUM | ENTERPRISE | MASTER`)

| Capability | OSS Local (`OSS_LOCAL`) | Cloud `BASIC` | Cloud `PREMIUM` | Cloud `ENTERPRISE` | Cloud `MASTER` |
|---|---|---|---|---|---|
| **QuantLib & Alpha Zoo Evaluator** | Unlimited (Local CPU) | Included | Included | Included | Included |
| **24/7 Hosted Paper Bots (Workers + D1)** | Self-hosted only | 1 bot | 5 bots | 25 bots | 100 bots |
| **Walk-Forward Sweep Windows** | Local CPU | 4 windows | 16 windows | 64 windows | 256 windows |
| **LLM Key Mode** | BYOK only | BYOK only | BYOK + Managed Pool | Managed Pool | Managed Pool |
| **Monthly Managed LLM Credits** | 0 | 0 | 500 credits | 3,000 credits | 15,000 credits |
| **Live Alpha Zoo IC/IR Cloud Feed** | Seed manifest (12 alphas) | Seed | Hourly Curated | Real-time + Regime | Full Institutional |
| **Billing Engine** | Free (`Apache-2.0`) | Free Tier | NOWPayments Crypto IPN | NOWPayments Crypto IPN | NOWPayments Crypto IPN |

---

## 4. 1-Click Local-to-Cloud Conversion Funnel

1. **Step 1 (Local CLI Discovery):** Developer runs a local paper simulation (`generateCliPaperReport`).
2. **Step 2 (Sanitized Bundle Export):** `createLocalToCloudSyncBundle` strips all local secrets (`apiKey`, `secret`, `token`, `password`, `private`) and signs the paper strategy config with a WebCrypto SHA-256 checksum (`safetyMode: 'PAPER_ONLY'`).
3. **Step 3 (Cloud SaaS Import & Upgrade):** `verifyAndImportCloudSyncBundle` verifies the SHA-256 hash and `PAPER_ONLY` invariant on CashClaw Cloud, hydrating the strategy into a 24/7 Cloudflare Worker bot slot.
