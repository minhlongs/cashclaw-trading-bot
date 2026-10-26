# CashClaw Quant OS — Institutional Go-To-Market & Marketing Playbook
**Version:** 1.0.0-open-core | **Target ARR:** $1,000,000 USD | **Framework:** Mekong CLI v6.0 / Sophia AI Factory
**Governance:** ADR-001 Paper-Only, Non-Custodial, Apache-2.0 Open-Core + Commercial Cloud SaaS

---

## Mục lục / Table of Contents
1. [Tầm Nhìn & Định Vị Cốt Lõi / Vision & Core Positioning](#1-tầm-nhìn--định-vị-cốt-lõi--vision--core-positioning)
2. [Ma Trận Khách Hàng Mục Tiêu / Ideal Customer Profile (ICP)](#2-ma-trận-khách-hàng-mục-tiêu--ideal-customer-profile-icp)
3. [Kiến Trúc Sản Phẩm & Định Giá 4 Tầng / 4-Tier Pricing Architecture](#3-kiến-trúc-sản-phẩm--định-giá-4-tầng--4-tier-pricing-architecture)
4. [Nguyên Tắc Truyền Thông & Tuân Thủ / Compliance & Brand Rules](#4-nguyên-tắc-truyền-thông--tuân-thủ--compliance--brand-rules)
5. [Phễu Chuyển Đổi Product-Led Growth (PLG)](#5-phễu-chuyển-đổi-product-led-growth-plg)
6. [Kế Hoạch Phân Phối Đa Kênh / Multi-Channel Distribution](#6-kế-hoạch-phân-phối-đa-kênh--multi-channel-distribution)
7. [Chỉ Số Đo Lường Hiệu Suất / Marketing & Revenue KPIs](#7-chỉ-số-đo-lường-hiệu-suất--marketing--revenue-kpis)

---

## 1. Tầm Nhìn & Định Vị Cốt Lõi / Vision & Core Positioning

### Tiếng Việt (VN):
CashClaw không phải là "bot chốt lãi tự động" hay "công cụ làm giàu nhanh" cho nhà đầu tư cá nhân thiếu kiến thức. **CashClaw là Hệ Điều Hành Định Lượng Cấp Thể Chế (Institutional Quant OS)** hoạt động theo mô hình Open-Core:
- **Lõi Mã Nguồn Mở (Apache-2.0)**: Cung cấp thư viện toán học tài chính `QuantLib` (28 mô-đun), động cơ mô phỏng kiểm định nhân quả không nhìn trước tương lai (No Lookahead Bias), và các chiến lược chuẩn (Multi-level Grid, Mean Reversion, Volatility-Adjusted DCA).
- **Hạ Tầng Cloud SaaS Thương Mại**: Cung cấp luồng dữ liệu Alpha Zoo, đo đạc vi cấu trúc sổ lệnh L2/L3 (Hawkes LOB Imbalance, Dupire MOT, Hurst Volatility), cơ chế phản biện đa tác tử (Multi-Agent Deliberation), và bộ lập lịch tần suất cao (Durable Cron Scheduler 1m/5m).

### English (EN):
CashClaw is an **Open-Core Institutional Algorithmic Trading Framework and Cloud SaaS**. It eliminates retail "get-rich-quick" narratives in favor of empirical causal alpha verification, statistical rigor (FDR control, Walk-Forward survival gates), and zero-custody WebCrypto security adhering strictly to `ADR-001 PAPER_BACKTEST_ONLY`.

---

## 2. Ma Trận Khách Hàng Mục Tiêu / Ideal Customer Profile (ICP)

| Phân khúc / Tier | Đối tượng / Persona | Nỗi đau cốt lõi / Pain Point | Giá trị của CashClaw / Value Proposition |
| :--- | :--- | :--- | :--- |
| **Tier 1: Quants & Devs** | Lập trình viên Python/TypeScript, Quant Researcher độc lập | Mệt mỏi vì bot mã nguồn mở kém chất lượng, lookahead bias làm sai lệch backtest | 100% kiểm thử nhánh QuantLib, mã nguồn mở Apache-2.0, kiểm soát FDR chặt chẽ |
| **Tier 2: Semi-Pro Traders** | Nhà giao dịch thuật toán bán chuyên, Quản lý tài sản gia đình | Thiếu hạ tầng máy chủ vận hành 24/7 ổn định, rủi ro bị hack sàn | Edge-native trên Cloudflare Workers, WebCrypto enclave, cảnh báo ký số qua Telegram |
| **Tier 3: Institutional Labs** | Quỹ đầu tư nhỏ, Crypto Prop Trading Desks | Chi phí phần mềm Bloomberg/Kaiko quá đắt đỏ, cần vi cấu trúc L2/L3 | Đầy đủ 28 công cụ vi cấu trúc, LOB Hawkes, Dupire MOT, Almgren-Chriss với giá $99-$299/tháng |

---

## 3. Kiến Trúc Sản Phẩm & Định Giá 4 Tầng / 4-Tier Pricing Architecture

Đồng bộ 100% với tài liệu pháp nhân `.mekong/company.json` và phân hệ hóa đơn `/billing`:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│      BASIC      │   │     PREMIUM     │   │   ENTERPRISE    │   │     MASTER      │
│     $0/tháng    │   │    $29/tháng    │   │    $99/tháng    │   │   $299/tháng    │
│  (Mã nguồn mở)  │   │  (Bán chạy nhất)│   │  (Thể chế nhỏ)  │   │   (Chuyên gia)  │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • 1 Bot tối đa  │   │ • 5 Bot tối đa  │   │ • 25 Bot tối đa │   │ • 100 Bot tối đa│
│ • Cron 60 phút  │   │ • Cron 5 phút   │   │ • Cron 1 phút   │   │ • Cron 1m ưu tiên
│ • Apache-2.0    │   │ • Alpha Feed    │   │ • Vi cấu trúc L2│   │ • 28 QuantLib   │
│ • Grid & MeanRev│   │ • Ký số Telegram│   │ • Đa tác tử LLM │   │ • Hỗ trợ 1-1    │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

1. **BASIC ($0/tháng - Miễn phí vĩnh viễn)**:
   - Mục đích: Phễu thu hút cộng đồng lập trình viên (Developer Adoption).
   - Quyền lợi: Tự lưu trữ (Self-hosted), 1 bot chạy mô phỏng, chu kỳ kiểm tra 60 phút, kiểm thử không giới hạn trên môi trường giả lập.
2. **PREMIUM ($29/tháng - 725.000 VNĐ)**:
   - Mục đích: Chuyển đổi người dùng cá nhân chuyên nghiệp (Self-Serve SaaS Conversion).
   - Quyền lợi: 5 bot đồng thời, chu kỳ 5 phút, truy cập Cloud Alpha Feed tuyển chọn, nhận tín hiệu qua Telegram.
3. **ENTERPRISE ($99/tháng - 2.475.000 VNĐ)**:
   - Mục đích: Nguồn thu chủ lực đạt cột mốc $500,000 ARR.
   - Quyền lợi: 25 bot, chu kỳ 1 phút tần suất cao, đo đạc mất cân bằng sổ lệnh L2, hội đồng thẩm định đa tác tử.
4. **MASTER ($299/tháng - 7.475.000 VNĐ)**:
   - Mục đích: Khách hàng tổ chức, quỹ đầu tư định lượng, đóng góp ARR cao nhất.
   - Quyền lợi: 100 bot, hạ tầng biên ưu tiên, hỗ trợ kiến trúc định lượng 1-1 trực tiếp từ đội ngũ sáng lập.

---

## 4. Nguyên Tắc Truyền Thông & Tuân Thủ / Compliance & Brand Rules

### Điều Cấm Tuyệt Đối (Strictly Prohibited):
1. **Không hứa hẹn lợi nhuận cố định**: Cấm dùng các cụm từ "lãi 2-10%/tháng", "chốt lãi chắc chắn", "thu nhập thụ động không rủi ro".
2. **Tuân thủ ADR-001 Paper-Only**: Mọi nội dung tiếp thị phải khẳng định sản phẩm là môi trường nghiên cứu và kiểm định giả lập, không gián tiếp hay trực tiếp nhận uỷ thác đầu tư tiền thật.
3. **Cấm nhắc đến Polar**: Hệ thống thanh toán chỉ ghi nhận NOWPayments IPN và PayOS; tuyệt đối không tích hợp hay quảng bá Polar.
4. **Minh bạch số liệu**: Mọi dẫn chứng về hiệu quả chiến lược phải đính kèm điều kiện kiểm thử (phí sàn 0.075%, độ trượt giá 0.05%, dữ liệu lịch sử tối thiểu 730 thanh nến).

### Thông Điệp Được Chuẩn Hóa (Approved Copy Blocks):
- *Khẩu hiệu chính (Headline)*: "CashClaw Quant OS — Institutional Quantitative Trading Framework & Cloud SaaS".
- *Dòng phụ (Subtitle)*: "Xây dựng, kiểm định và tối ưu hóa danh mục chiến lược định lượng với 28 công cụ QuantLib và cơ chế bảo vệ vốn bất khả xâm phạm."

---

## 5. Phễu Chuyển Đổi Product-Led Growth (PLG)

```
[ Giai đoạn 1: Khám Phá (Awareness) ]
  ├── Bài viết phân tích vi cấu trúc thị trường (Substack / Mirror / Medium)
  ├── Mã nguồn mở GitHub (@cashclaw/quantlib) đạt Star & Fork
  └── Video phân tích Walk-Forward Backtesting trên YouTube
            │
            ▼
[ Giai đoạn 2: Trải Nghiệm (Activation - Gói BASIC $0) ]
  ├── Đăng ký nhanh không cần thẻ tín dụng
  ├── Khởi tạo bot đầu tiên qua Bot Wizard chỉ trong 3 phút
  └── Chạy kiểm định giả lập Paper Trading trên cặp BTC/USDT & ETH/USDT
            │
            ▼
[ Giai đoạn 3: Giữ Chân & Nâng Cấp (Retention & Expansion - Gói PREMIUM $29) ]
  ├── Giới hạn 1 bot của gói BASIC thúc đẩy nhu cầu chạy đa cặp tiền
  ├── Kích hoạt Cloud Alpha Feed và cảnh báo biến động Telegram
  └── Tích hợp thanh toán tiền mã hóa (NOWPayments) hoặc nội địa (PayOS)
            │
            ▼
[ Giai đoạn 4: Doanh Nghiệp (Expansion - Gói ENTERPRISE & MASTER) ]
  └── Mở rộng quy mô danh mục: Cần độ trễ 1 phút, vi cấu trúc L2 và hỗ trợ API.
```

---

## 6. Kế Hoạch Phân Phối Đa Kênh / Multi-Channel Distribution

1. **Kênh Nhà Phát Triển (Developer & Open-Source Relations)**:
   - Đưa `@cashclaw/quantlib` lên npm và GitHub Trending trong nhóm `algorithmic-trading`.
   - Viết bài hướng dẫn kỹ thuật: *"Làm thế nào để tránh Lookahead Bias trong kiểm định chiến lược tiền mã hóa"*.
2. **Kênh Cộng Đồng Định Lượng (Quant Communities)**:
   - Tham gia thảo luận kỹ thuật trên r/algotrading, Quantitative Finance Discord, và các nhóm Quant tại Việt Nam.
   - Tổ chức sự kiện trực tuyến "Causal Alpha Challenge": Đánh giá alpha bằng công cụ FDR & Survival Gate.
3. **Kênh Bản Tin Phân Tích (Technical Substack / Newsletter)**:
   - Xuất bản bản tin định kỳ 2 tuần/lần giải mã vi cấu trúc sổ lệnh (Hawkes LOB Imbalance, Dupire Local Volatility).
   - Đính kèm kết quả chạy mô phỏng công khai minh bạch.

---

## 7. Chỉ Số Đo Lường Hiệu Suất / Marketing & Revenue KPIs

| Mục tiêu / Dimension | Chỉ số chính / Metric | Kỳ hạn 30 ngày | Kỳ hạn 90 ngày | Mục tiêu 12 tháng (ARR) |
| :--- | :--- | :--- | :--- | :--- |
| **Thu hút (Acquisition)** | GitHub Stars trên Core Repo | 250+ stars | 1,000+ stars | 5,000+ stars |
| **Kích hoạt (Activation)** | Người dùng đăng ký gói BASIC | 500 người | 2,500 người | 15,000 người |
| **Chuyển đổi (Conversion)** | Khách hàng trả phí (PREMIUM+) | 30 khách | 180 khách | 1,200 khách |
| **Tỷ lệ giữ chân (Retention)** | Net Revenue Retention (NRR) | > 95% | > 105% | > 115% |
| **Doanh thu (Revenue)** | Monthly Recurring Revenue (MRR) | $1,500 | $15,000 | **$83,333 ($1M ARR)** |

---
*Tài liệu được phê duyệt chính thức bởi Ban Giám Đốc Tiếp Thị (CMO Office) & Mekong CLI Team — Sẵn sàng cho toàn bộ đội ngũ triển khai.*
