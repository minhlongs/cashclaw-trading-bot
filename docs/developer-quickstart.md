# CashClaw CLI & Developer Quickstart Guide
*Hướng Dẫn Bắt Đầu Nhanh Dành Cho Nhà Phát Triển (Song Ngữ VN / EN)*

---

## 1. Giới Thiệu / Overview

**CashClaw Open-Core** là nền tảng nghiên cứu định lượng (Quantitative Research OS) mã nguồn mở theo giấy phép **Apache-2.0**.
Nền tảng cung cấp bộ công cụ dòng lệnh (Zero-Dependency Node.js CLI) và các thư viện tính toán vi cấu trúc thị trường (`@cashclaw/quantlib`) hoàn toàn độc lập, an toàn với quy chuẩn **ADR-001 (Chỉ chạy Paper/Mô phỏng - Tuyệt đối không giao dịch tiền thật)**.

**CashClaw Open-Core** is an Apache-2.0 open-source quantitative research platform. It delivers zero-dependency CLI tooling and microstructure calculation primitives (`@cashclaw/quantlib`) under a strict **ADR-001 (PAPER/BACKTEST ONLY - zero live order routing)** invariant.

---

## 2. Cài Đặt & Khởi Chạy / Quick Installation & Run

Không cần cài đặt thêm bất kỳ thư viện bên thứ ba nào — chỉ cần Node.js >= 18:
Zero external dependencies required — runs directly on Node.js >= 18:

```bash
# 1. Chạy mô phỏng định lượng 60s tức thì (Quickstart Simulation)
npx cashclaw quickstart

# 2. Tùy chỉnh cặp giao dịch & vốn mô phỏng (Custom Symbol & Capital)
npx cashclaw quickstart --symbol ETH/USDT --capital 10000

# 3. Xuất kết quả dưới định dạng JSON cho tự động hóa CI/CD
npx cashclaw quickstart --symbol SOL/USDT --json
```

---

## 3. Các Lệnh Chính Của CLI / Core CLI Commands

### 3.1. `quickstart` — Mô phỏng chiến lược Volatility-Adjusted DCA
Chạy kiểm thử 30 bước mô phỏng với đầy đủ phí giao dịch và độ trượt giá (Slippage):
Runs a 30-step paper simulation strictly factoring in transaction fees and execution slippage:

```bash
node ./bin/cashclaw.js quickstart --symbol BTC/USDT --capital 5000
```

### 3.2. `eval` — Đánh giá vi cấu trúc & độ biến động (Quantitative Diagnostics)
Tính toán độ biến động Garman-Klass và chênh lệch giá Corwin-Schultz không có độ trễ:
Computes high-frequency Garman-Klass volatility and Corwin-Schultz bid-ask spreads:

```bash
node ./bin/cashclaw.js eval --symbol BTC/USDT
```

### 3.3. `export-sync` — Xuất cấu hình đồng bộ lên Cloud SaaS (1-Click Migration)
Tạo gói dữ liệu đồng bộ đã được mã hóa kiểm tra bằng hàm băm SHA-256 để đưa bot lên Cloudflare Workers chạy 24/7:
Generates a signed, SHA-256 verified migration bundle to sync local bot configurations to Cloudflare Edge:

```bash
node ./bin/cashclaw.js export-sync --name "MyAlphaBot" --symbol BTC/USDT
```

---

## 4. Cầu Nối Lên Bản Cloud SaaS / Cloud SaaS Upsell Bridge

| Tính Năng / Feature | Mã Nguồn Mở (OSS CLI) | Bản Đám Mây (Cloud SaaS) |
|---|---|---|
| **Giấy phép / License** | Apache-2.0 Miễn phí | Gói Doanh nghiệp / SaaS |
| **Môi trường chạy / Runtime** | Máy cục bộ (Local terminal) | Cloudflare Workers Edge 24/7 |
| **Bảo vệ rủi ro / Safety** | Giới hạn Paper-only | Hội đồng AI Độc lập (LLM Debate) |
| **Quản trị người dùng / Multi-Tenant** | 1 người dùng | Phân quyền IDOR & QuotaGuard |
| **Chi phí / Pricing** | $0 Miễn phí trọn đời | Gói Basic / Premium / Enterprise |

**Đăng ký và đồng bộ ngay tại:** [https://cloud.cashclaw.io/sync?source=oss-cli](https://cloud.cashclaw.io/sync?source=oss-cli)
