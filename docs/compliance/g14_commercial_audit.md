# Gate G14 — Kiểm Toán Kinh Tế Thương Mại, Đơn Vị COGS & Tuân Thủ Pháp Lý / Commercial Economics, Subscriber COGS & Regulatory Compliance Audit

- **Repository:** `minhlongs/cashclaw-trading-bot`
- **Audit Gate:** Issue `#60` — Gate `G14` (cross-linked with Gates `G11` & `G12`)
- **System Mode:** `ADR-001 PAPER/BACKTEST ONLY` — Non-Custodial Quantitative Research & Simulation Software
- **Audit Date:** `2026-11-14`

---

## 1. Tuyên Bố Miễn Trừ Liên Kết & Không Phát Hành Token / Explicit Non-Affiliation & Zero-Token Disclaimer

### Tiếng Việt
Dự án **`minhlongs/cashclaw-trading-bot`** là một khung phần mềm nghiên cứu định lượng mã nguồn mở (Apache-2.0 Open-Core) và dịch vụ đám mây mô phỏng giao dịch giấy (**Paper/Backtest Only**, **Không lưu ký tài sản — Non-Custodial**) hoàn toàn độc lập. Dự án **KHÔNG có bất kỳ sự liên kết, hợp tác, bảo chứng, liên thông ngân quỹ hay kết nối kỹ thuật nào** với:
- `moltlaunch/cashclaw`,
- `ertugrulakben/cashclaw`,
- **HYRVE AI**, hoặc
- Hợp đồng thông minh / token **`MrCashClaw` / `CASHCLAW`** trên mạng lưới Base (`0x45b9a03a05f86088cd1a00874a05dda2c6915ba3`).

`minhlongs/cashclaw-trading-bot` **không phát hành bất kỳ token, đồng tiền mã hóa, sản phẩm sinh lời (yield), hợp đồng ủy thác đầu tư nào**, và **không đưa ra bất kỳ cam kết lợi nhuận tài chính nào**.

### English
**`minhlongs/cashclaw-trading-bot`** is a wholly independent Apache-2.0 Open-Core quantitative research and non-custodial paper-trading simulation software project (**ADR-001 Paper/Backtest Only**). It has **ZERO affiliation, endorsement, treasury link, corporate relationship, or technical connection** with:
- `moltlaunch/cashclaw`,
- `ertugrulakben/cashclaw`,
- **HYRVE AI**, or
- The Base blockchain token **`MrCashClaw` / `CASHCLAW`** (`0x45b9a03a05f86088cd1a00874a05dda2c6915ba3`).

`minhlongs/cashclaw-trading-bot` **issues no token, coin, staking/yield product, or pooled investment vehicle, holds zero customer funds, and makes zero profit or return guarantees**.

---

## 2. Phân Tách Tuyệt Đối 5 Đại Lượng Kinh Tế / Strict Separation of the 5 Economic Quantities

### Tiếng Việt
Để ngăn chặn việc nhầm lẫn giữa kết quả mô phỏng toán học và dòng tiền kinh doanh phần mềm, hệ thống quản trị và giao diện (`src/components/dashboard/dashboard-kpi-cards.tsx`, `src/components/billing/quota-usage-card.tsx`) phân tách rạch ròi 5 đại lượng kinh tế độc lập:

| Mã | Đại Lượng Kinh Tế | Bản Chất Kế Toán & Kỹ Thuật | Ranh Giới Hiển Thị & Pháp Lý |
|---|---|---|---|
| **(A)** | **Gross Simulated Alpha** (Alpha Mô Phỏng Gộp) | Chênh lệch lợi suất lý thuyết trước chi phí giao dịch trên chuỗi OHLCV lịch sử. | Chỉ dùng làm đầu vào kiểm định nhân quả; không bao giờ được quảng bá làm lợi nhuận thực tế. |
| **(B)** | **Net Simulated Paper PnL** (PnL Giấy Ròng Sau Chi Phí) | Lợi nhuận mô phỏng sau khi trừ phí sàn VIP-0, trượt giá Almgren-Chriss / L1 spread và phí funding hợp đồng vĩnh cửu. | Gắn nhãn bắt buộc `data-testid="paper-simulation-badge"` (`MÔ PHỎNG GIẤY — KHÔNG PHẢI TIỀN THẬT`). Không phải tiền thật. |
| **(C)** | **Risk-Adjusted Statistical Validity** (Độ Tin Cậy Thống Kê Điều Chỉnh Rủi Ro) | Các thước đo kiểm định giả thuyết: Deflated Sharpe Ratio (`DSR`), Probability of Backtest Overfitting (`PBO`), `CVaR 99%`, và sổ đăng ký thử nghiệm (`artifacts/trial_registry.jsonl`). | Thước đo bác bỏ khoa học (falsification gate), không phải cam kết hiệu suất tương lai. |
| **(D)** | **CashClaw Non-Custodial SaaS Revenue & COGS Margin** (Doanh Thu Thuê Bao Phần Mềm & Biên Lợi Nhuận Gộp) | Phí thuê bao phần mềm hàng tháng (`$0 / $29 / $99 / $299`) trừ chi phí hạ tầng biên Cloudflare (Workers, DO SQLite, D1, R2), cổng thanh toán và hạn ngạch LLM. | Doanh thu dịch vụ phần mềm máy tính (SaaS compute & tooling), hoàn toàn độc lập với PnL giao dịch của người dùng. |
| **(E)** | **Prepaid LLM Credits & Deferred Subscription Liability** (Tín Dụng LLM Trả Trước & Doanh Thu Chưa Thực Hiện) | Nghĩa vụ cung cấp tài nguyên tính toán đám mây / token LLM còn lại trong kỳ thuê bao (`CreditLedgerStore`, `SaasEntitlementStore`). | Đơn vị định mức tài nguyên phần mềm nội bộ, không quy đổi thành tiền mặt, không lưu ký tài sản số. |

### English
To prevent any conflation between mathematical strategy backtests and SaaS business cashflows, the codebase and UI (`data-testid="paper-simulation-badge"`, `data-testid="non-custodial-saas-badge"`) enforce strict separation across five distinct economic quantities:

1. **(A) Gross Simulated Alpha:** Pre-friction theoretical signal return before exchange fees, spread, impact, or funding. Used strictly as an intermediate diagnostic input.
2. **(B) Net Simulated Paper PnL:** Virtual paper-account return after deducting VIP-0 maker/taker fees, L1/Almgren-Chriss slippage, and perpetual funding drag. Prominently badged `SIMULATED PAPER PnL — NOT REAL FUNDS` across Balance, Capital, PnL, and Billing cards.
3. **(C) Risk-Adjusted Statistical Validity (`DSR`, `PBO`, `CVaR`):** Multiple-testing and tail-risk falsification metrics over `artifacts/trial_registry.jsonl`. Measures statistical survival against data-snooping, never guaranteed future yield.
4. **(D) CashClaw Non-Custodial SaaS Revenue & COGS Margin:** Fixed monthly software subscription revenue (`BASIC $0`, `PREMIUM $29`, `ENTERPRISE $99`, `MASTER $299`) minus measured Cloudflare edge infrastructure + wholesale LLM token COGS (`src/ee/billing/subscriber-cogs-auditor.ts`). Zero performance fees or AUM fees.
5. **(E) Prepaid LLM Credits & Deferred Subscription Liability:** Unearned subscription service obligation and remaining monthly LLM deliberation credit quota (`1,000` to `250,000` credits/month). Non-redeemable compute units; zero customer fund custody.

---

## 3. Kiểm Toán Đơn Vị Kinh Tế & Sàn Biên Lợi Nhuận Thuê Bao / Measured Per-Subscriber COGS & Margin Floor (`subscriber-cogs-auditor.ts`)

### Tiếng Việt & English Methodology
Mô-đun `src/ee/billing/subscriber-cogs-auditor.ts` (được nối trực tiếp vào `GET /api/ee/quotas`) tính toán chi phí giá vốn hàng bán (COGS) hàng tháng trên từng thuê bao theo bảng giá công bố của Cloudflare (Workers Paid CPU & requests, Durable Objects SQLite duration & storage, D1 rows read/written, R2 cache), phí cổng thanh toán (`0.5%`), và chi phí sỉ LLM (`FAST`: `$0.00035/credit`; `REASONING`: `$0.00060/credit`) dưới 3 kịch bản sử dụng:
- **`BEAR` (Thị trường trầm lắng — 20% bot, 15% tín dụng LLM, 80% FAST / 20% REASONING)**
- **`BASE` (Vận hành cơ sở — 55% bot, 50% tín dụng LLM, 70% FAST / 30% REASONING)**
- **`BULL` (Kịch bản vắt kiệt trần 100% hạn ngạch — 100% số bot chạy 24/7 suốt 43.830 phút/tháng + 16 lần Walk-Forward + đốt sạch 100% tín dụng LLM ở mô hình đắt nhất `REASONING` `$0.00060/credit`)**

### Bảng Đo Lường COGS & Biên Lợi Nhuận Gộp / Measured Monthly COGS & Gross Margin Table (`G14_SUBSCRIBER_COGS_V1`)

| Tier (Price/Mo) | Scenario | Bot Ticks / Mo | Consumed LLM Credits | Infra COGS (Workers+DO+D1+R2) | Managed LLM COGS | Gateway Fee (`0.5%`) | Total Monthly COGS | Gross Margin (`$`) | Gross Margin (`%`) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **BASIC (`$0`)** | `BEAR` | 146 | 0 *(BYOK only)* | `$0.0042` | `$0.0000` | `$0.0000` | **`$0.0042`** | `-$0.0042` | Free CAC |
| **BASIC (`$0`)** | `BASE` | 402 | 0 *(BYOK only)* | `$0.0058` | `$0.0000` | `$0.0000` | **`$0.0058`** | `-$0.0058` | Free CAC |
| **BASIC (`$0`)** | `BULL` (100%) | 730 | 0 *(BYOK only)* | `$0.0092` | `$0.0000` | `$0.0000` | **`$0.0092`** | `-$0.0092` | Free CAC |
| **PREMIUM (`$29`)** | `BEAR` | 8,766 | 1,500 | `$0.0120` | `$0.6000` | `$0.1450` | **`$0.7570`** | **`+$28.2430`** | **`97.39%`** |
| **PREMIUM (`$29`)** | `BASE` | 24,107 | 5,000 | `$0.0377` | `$2.1250` | `$0.1450` | **`$2.3077`** | **`+$26.6923`** | **`92.04%`** |
| **PREMIUM (`$29`)** | `BULL` (100%) | 43,830 | 10,000 | `$0.1002` | `$6.0000` | `$0.1450` | **`$6.2452`** | **`+$22.7548`** | **`78.46%`** |
| **ENTERPRISE (`$99`)** | `BEAR` | 219,150 | 7,500 | `$0.2041` | `$3.0000` | `$0.4950` | **`$3.6991`** | **`+$95.3009`** | **`96.26%`** |
| **ENTERPRISE (`$99`)** | `BASE` | 602,663 | 25,000 | `$0.7108` | `$10.6250` | `$0.4950` | **`$11.8308`** | **`+$87.1692`** | **`88.05%`** |
| **ENTERPRISE (`$99`)** | `BULL` (100%) | 1,095,750 | 50,000 | `$2.0636` | `$30.0000` | `$0.4950` | **`$32.5586`** | **`+$66.4414`** | **`67.11%`** |
| **MASTER (`$299`)** | `BEAR` | 876,600 | 37,500 | `$0.8120` | `$15.0000` | `$1.4950` | **`$17.3070`** | **`+$281.6930`** | **`94.21%`** |
| **MASTER (`$299`)** | `BASE` | 2,410,650 | 125,000 | `$2.8358` | `$53.1250` | `$1.4950` | **`$57.4558`** | **`+$241.5442`** | **`80.78%`** |
| **MASTER (`$299`)** | `BULL` (100%) | 4,383,000 | 250,000 | `$8.2413` | `$150.0000` | `$1.4950` | **`$159.7363`** | **`+$139.2637`** | **`46.58%`** |

### Kết Luận Bảo Vệ Biên Lợi Nhuận / Margin-Floor Proof (`allPaidTiersPositiveAtFullExhaustion = true`)
- **TV:** Nhờ trần cứng `enforceWorkspaceQuota` (`quota-guard.ts`) và sổ cái tín dụng `debitDeliberationCredits` (`llm-credit-ledger.ts`, trả về `402 INSUFFICIENT_LLM_CREDITS` ngay khi chạm trần), ngay cả khi 100% người dùng trả phí khai thác tối đa toàn bộ bot 24/7 và đốt 100% hạn ngạch vào mô hình `REASONING` đắt nhất (`BULL`), biên lợi nhuận gộp vẫn dương tuyệt đối: **`78.46%` (`PREMIUM`)**, **`67.11%` (`ENTERPRISE`)**, và **`46.58%` (`MASTER`)**. Gói miễn phí `BASIC` khóa `managedLlmPoolAllowed = false` (chỉ hỗ trợ BYOK/LOCAL), giữ chi phí hạ tầng tối đa ở mức **`$0.0092`/tháng/người dùng**.
- **EN:** Hard server-side enforcement in `quota-guard.ts` and `llm-credit-ledger.ts` mathematically eliminates unbounded LLM or cron cost runaway. Even under simultaneous 100% 24/7 bot utilization and 100% `REASONING`-tier credit exhaustion (`BULL`), gross margin floors remain strictly positive at **`+$22.75` (`78.46%`)** on `PREMIUM`, **`+$66.44` (`67.11%`)** on `ENTERPRISE`, and **`+$139.26` (`46.58%`)** on `MASTER`, while `BASIC` disables managed LLM pool access (`$0.00` LLM COGS; `<$0.01/mo` edge infra cost).

### Gate G12 Kinh Tế Token AI Thực Nghiệm / Empirical AI Net-of-Token-Cost Finding (`artifacts/g12_ai_roi_redteam.json`)
- **TV:** Kiểm định mù 3 nhánh (`evaluateThreeArmNetRoi`) trên 16 cửa sổ OOS chứng minh rằng gọi hội đồng tranh biện đa tác tử (`MULTI_AGENT_DEBATE`, chi phí token gấp `7.2x` mô hình đơn) trên từng thanh nến 4h cho tài khoản nhỏ (`$2,500`) làm bốc hơi **`-$89.68`** lợi nhuận ròng sau chi phí token → hệ thống tự động phán quyết **`DISABLE_NEGATIVE_NET_ROI`**. Mô-đun AI chỉ đạt **`KEEP_READ_ONLY_CRITIC`** khi chạy ngoại tuyến định kỳ với tư cách bộ phản biện chiến lược chỉ đọc (**0 quyền đặt lệnh**).
- **EN:** Three-arm blind OOS ablation (`evaluateThreeArmNetRoi`) proves per-bar `MULTI_AGENT_DEBATE` (`7.2x` token cost vs single model) on a `$2,500` reference paper account suffers **`-$89.68`** incremental net-of-token drag and deterministically triggers **`DISABLE_NEGATIVE_NET_ROI`**. LLM deliberation is strictly restricted to offline **Read-Only Strategy Critic** duty (`orderAuthorityCount === 0`).

---

## 4. Ma Trận Tuân Thủ Pháp Lý Đa Quốc Gia / Multi-Jurisdiction Regulatory Compliance Matrix

| Khung Pháp Lý / Framework | Phạm Vi Điều Chỉnh / Statutory Scope | Kiểm Soát Kỹ Thuật Trong CashClaw / Enforced Technical Control |
|---|---|---|
| **Việt Nam — Luật Công nghiệp Công nghệ số `71/2025/QH15` & Nghị quyết `05/2025/NQ-CP`** | Phân loại tài sản số, khung thử nghiệm có kiểm soát (sandbox) và quản lý dịch vụ tài sản mã hóa tại Việt Nam. | **TV:** CashClaw chỉ cung cấp phần mềm phân tích định lượng & mô phỏng giấy (`ADR-001`), không lưu ký, không môi giới, không vận hành sàn giao dịch tài sản mã hóa.<br>**EN:** Strictly non-custodial analytical & paper-simulation software; zero virtual-asset exchange, brokerage, or custody operations. |
| **Việt Nam — Nghị định `284/2026/NĐ-CP` (hiệu lực `01/09/2026`) & Quy định thanh toán NHNN** | Ranh giới giữa nhà cung cấp dịch vụ tài sản mã hóa được cấp phép (licensed VASP) và phần mềm công cụ; nghiêm cấm dùng tài sản mã hóa làm phương tiện thanh toán nội địa trái phép. | **TV:** `POST /api/ee/billing/checkout` tích hợp `inspectVnCryptoCheckoutBlock` (`src/ee/billing/vn-jurisdiction-guard.ts`): chặn cứng mọi yêu cầu từ `VN` (`cf-ipcountry`, `x-country-code`, `billingCountry === 'VN'`) với mã **HTTP `451` (`CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION`)**, hướng dẫn xuất hóa đơn VND/doanh nghiệp hợp pháp.<br>**EN:** Deterministic `VN` geo/billing guard returns **HTTP `451`** on domestic crypto checkout while preserving international NOWPayments settlement outside `VN`. |
| **Việt Nam — Luật An ninh mạng `116/2025/QH15`** | Bảo vệ dữ liệu định danh phiên, chống giả mạo truy cập trái phép liên thuê bao và an toàn mật mã ứng dụng. | **TV:** `middleware.ts` xóa sạch header `x-user-id` giả mạo từ client; `detectCrossWorkspaceIdor` trả về **`403 WORKSPACE_FORBIDDEN`** khi truy cập chéo `workspaceId`; khóa người dùng mã hóa bằng WebCrypto; `sanitizeUntrusted` chặn `50/50` mẫu prompt injection.<br>**EN:** Server-derived D1 session identity, strict `403` anti-IDOR across all EE routes, WebCrypto enclave, and `50/50` (`100%`) prompt-injection neutralization. |
| **Việt Nam — Luật Chứng khoán `54/2019/QH14` & Luật sửa đổi `56/2024/QH15`** | Hoạt động tư vấn đầu tư chứng khoán cá nhân hóa và quản lý danh mục ủy thác phải được UBCKNN cấp phép. | **TV:** Phần mềm công cụ toán học tiêu chuẩn hóa, không cá nhân hóa theo hồ sơ tài chính cá nhân, không nhận ủy thác vốn, không thu phí hiệu suất.<br>**EN:** Impersonal, standardized quantitative backtesting software; zero personalized investment advice, zero discretionary portfolio management. |
| **EU — MiCA Regulation `(EU) 2023/1114` (Art. 3(1)(16) & Art. 143)** | Quy định cấp phép Crypto-Asset Service Provider (CASP) đối với lưu ký, thực thi lệnh thay mặt khách hàng, nhận/truyền lệnh và tư vấn cá nhân hóa. | **TV & EN:** CashClaw never holds keys/funds, never receives or transmits orders on behalf of clients (`ADR-001` paper-only lock + zero AI order fields in `DecisionProposal`), remaining outside CASP custody/execution scope as pure non-custodial analytical software. |
| **US — Publishers' Exclusion (`Lowe v. SEC`, 472 U.S. 181) & `CFTC Rule 4.14(a)(9)` (`Taucher v. Brown-Hruska`)** | Miễn trừ đăng ký Investment Adviser / CTA đối với công cụ xuất bản và phần mềm định lượng khách quan, không tùy nghi, phân phối đồng nhất (impersonal, non-discretionary software). | **TV & EN:** Deterministic mathematical indicators (`QuantLib`) and user-configured simulation parameters operate identically for any user running the same inputs; CashClaw exercises zero discretionary trade authority over client accounts. |
| **Singapore — MAS Payment Services Act `2019` (`PSA 2019`)** | Cấp phép Digital Payment Token (DPT) service khi đơn vị nắm giữ, kiểm soát hoặc chuyển giao tiền/khóa riêng của khách hàng. | **TV & EN:** Non-custodial SaaS architecture never touches customer DPT balances or private keys; international SaaS subscription invoicing uses hosted third-party merchant checkout with HMAC-SHA512 anti-replay verification (`nowpayments-ipn-handler.ts`). |

---

## 5. Trạng Thái Cổng Kiểm Định / Gate Verification Summary (`Issue #60`)

### Tiếng Việt & English Gate Ledger

| Gate | Phạm Vi Kiểm Định / Audit Scope | Bằng Chứng Kỹ Thuật / Verification Evidence | Trạng Thái / Status |
|---|---|---|---|
| **G11** | Cô lập đa thuê bao Anti-IDOR (`403`), chống phát lại IPN `10x Promise.all` (kích hoạt tối đa `1` lần), từ chối `partially_paid`/trả thiếu, chặn thanh toán crypto tại `VN` (`HTTP 451`), huy hiệu `SIMULATED PAPER PnL` & Playwright Chromium E2E. | `src/ee/tenancy/workspace-request-context.ts`, `src/ee/billing/nowpayments-ipn-handler.ts`, `src/ee/billing/vn-jurisdiction-guard.ts`, `tests/security/g11_ipn_and_idor.test.ts`, `tests/security/g11_tenant_e2e.spec.ts` | **`VERIFIED (PAPER SAAS)`** |
| **G12** | Quyền đặt lệnh AI bằng `0`, Red-Team `50/50` (`100%`) mẫu prompt injection đa ngôn ngữ/ẩn mã, kiểm định mù 3 nhánh ROI ròng sau chi phí token LLM. | `src/tree/research/tradingagents/security-gate-*.ts`, `src/tree/research/tradingagents/net-roi-*.ts`, `scripts/generate-g12-redteam.ts`, `artifacts/g12_ai_roi_redteam.json`, `tests/research/g12_ai_safety_roi.test.ts` | **`VERIFIED (READ-ONLY CRITIC)`** |
| **G13** | Kiểm định Paper-Forward thời gian thực liên tục **60–90 ngày** trên dữ liệu sống ngoài mẫu (out-of-sample live shadow clock). | Không thể nén thời gian bằng kiểm thử lịch sử; bắt buộc chạy đồng hồ thời gian thực 60–90 ngày. | **`NOT VERIFIED` (`TIME-GATED`)** |
| **G14** | Phân tách 5 đại lượng kinh tế, kiểm toán COGS Bear/Base/Bull chứng minh biên lợi nhuận dương ở 100% trần hạn ngạch, ma trận tuân thủ pháp lý VN/EU/US/SG & miễn trừ không liên kết token. | `src/ee/billing/subscriber-cogs-auditor.ts`, `GET /api/ee/quotas?includeCogsMatrix=1`, `docs/compliance/g14_commercial_audit.md` | **`VERIFIED`** |
| **G15** | Phê duyệt độc lập của Chủ sở hữu & Mở khóa giao dịch tiền thật (Independent Owner Sign-Off & Live-Trading Unlock). | Bị khóa cứng theo `ADR-001 PAPER/BACKTEST ONLY`; không có bất kỳ cờ mở khóa tiền thật nào được phép bật. | **`NOT VERIFIED` (`HARD-LOCKED`)** |
