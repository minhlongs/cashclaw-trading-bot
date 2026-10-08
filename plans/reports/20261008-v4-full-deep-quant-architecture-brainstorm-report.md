# Brainstorming Report: Full-Deep v4 Quantitative OS & Statistical Arbitrage Suite

**Date:** 2026-10-08  
**Scope:** Trade-Bot Institutional Evolution (v4 Full-Deep)  
**Decision:** Hợp nhất toàn diện 3 Trụ Cột (Runtime Execution Wiring, Kalman Filter Stat-Arb, Cockpit UI Integration)

---

## 1. Problem Statement & Objectives
Sau khi hoàn thiện trọn vẹn bộ khung v3 (Smart Order Routing, L2 Cockpit UI, Copula CVaR), hệ thống cần bước vào pha tiến hóa toàn diện (Full-Deep) nhằm:
1. **Khép kín vòng lặp thực thi (Runtime Wiring):** Đưa các thuật toán SOR, TWAP/VWAP Slicers và Fleet Risk Circuit Breaker vào luồng xử lý thực của `ExchangeOrchestrator` và vòng lặp bot.
2. **Khai phá Alpha Định Lượng Độc Lập (Kalman Filter Stat-Arb Desk):** Xây dựng bộ máy lọc Kalman đệ quy (Recursive Online Kalman Filter) xác định hệ số bù trừ động ($\beta_t$), kiểm định đồng liên kết Engle-Granger/ADF và ước lượng quá trình Ornstein-Uhlenbeck (mean-reversion half-life).
3. **Trực quan hóa Live Cockpit trên Terminal HUD:** Tích hợp L2 Depth Ladder, Microstructure Toxicity Gauge và Fleet Risk Radar Card trực tiếp vào `DashboardClient` với cơ chế cập nhật realtime/polling và song ngữ i18n hoàn chỉnh.
4. **Bảo toàn nghiêm ngặt các bất biến:** ADR-001 Paper-only (0 lệnh thật, 0 tiền thật), file $\le 200$ LOC, 0 `:any`, 0 ESLint warnings, 100% test coverage trên các module định lượng.

---

## 2. Các Trụ Cột Chi Tiết (Full-Deep Synergy)

### Trụ Cột 1: Runtime Engine & Execution Orchestration Wiring (`src/tree/execution/runtime/` & `src/land/`)
- **SOR Execution Coordinator:** Tích hợp bộ định tuyến `routeOrderSlices` và bộ chia lệnh `calculateTwapSlices` vào `ExchangeOrchestrator`, cho phép các lệnh giao dịch lớn tự động được băm nhỏ và gửi tới các sàn ảo (Binance, OKX, Bybit).
- **Fleet Risk Interceptor:** Lồng ghép `evaluateFleetRiskState` và `FleetCircuitBreaker` vào chu kỳ tick của `BotManager`, tự động ngắt/hạ nhịp bot khi tổng sụt giảm vốn danh mục vượt ngưỡng an toàn ($15\%$).

### Trụ Cột 2: High-Performance Statistical Arbitrage & Kalman Filter Pairs Desk (`src/tree/quantlib/statarb/`)
- **Online Kalman Filter (`kalman-filter-hedge.ts`):** Ước lượng hồi quy động trạng thái ẩn theo thời gian thực $[\alpha_t, \beta_t]^T$ giữa cặp tài sản (ví dụ: BTC/USDT vs ETH/USDT) mà không bị lookahead bias.
- **Engle-Granger & OU Mean-Reversion Estimator (`ou-cointegration-estimator.ts`):** Kiểm định tính dừng của phần dư spread, tính toán tốc độ hồi quy $\theta$, trung bình dài hạn $\mu$ và chu kỳ bán rã (half-life $t_{1/2} = \ln(2)/\theta$).
- **Stat-Arb Signals & Bollinger Gate (`statarb-signals.ts`):** Tạo tín hiệu vào/ra lệnh dựa trên dynamic z-score của spread phần dư.

### Trụ Cột 3: Dashboard Cockpit Live Telemetry & Interactive Terminal HUD (`src/components/dashboard/`)
- **Cockpit Section Integration:** Gắn `L2DepthLadder`, `MicrostructureToxicityGauge`, `FleetRiskRadarCard` vào `DashboardClient`.
- **Live Market Feed Adapter:** Kết nối dữ liệu sổ lệnh và ticker từ `/api/tickers` vào Cockpit HUD.
- **Bilingual Localization:** Hoàn thiện cặp từ điển `en.json` và `vi.json` cho các nhãn trực quan mới (`dashboard.cockpit.*`).

### Trụ Cột 4: End-to-End Cross-Stack Verification & Quality Gates
- **E2E Integration Test (`test/e2e/full-suite-v4-deep-quant.test.ts`):** Kiểm định liên thông toàn chuỗi từ phân tích Cointegration $\rightarrow$ Kalman Filter $\rightarrow$ Stat-Arb Signal $\rightarrow$ TWAP/SOR execution $\rightarrow$ Cockpit UI Telemetry.
- **Zero-Defect Verification:** Toàn bộ test suite vượt qua (100% pass), typecheck sạch, build sạch.

---

## 3. Rủi Ro & Biện Pháp Phòng Vệ
1. **Rủi ro rò rỉ dữ liệu tương lai (Lookahead Bias):** Kalman Filter chỉ cập nhật trạng thái đệ quy từ $t-1$ sang $t$, không sử dụng dữ liệu $t+1$.
2. **Rủi ro phình to file (> 200 LOC):** Phân tách chặt chẽ các module tính toán toán học, giao diện UI và bộ điều phối thành các file đơn mục đích ($\le 120$ LOC).
3. **Rủi ro vi phạm an toàn giao dịch:** Nghiêm ngặt tuân thủ ADR-001, mọi thao tác khớp lệnh đều nằm trong môi trường mô phỏng `PaperExchange`.

---

## 4. Tiêu Chí Nghiệm Thu (Definition of Done)
- [x] 100% các file mới $\le 200$ LOC (mục tiêu $\le 120$ LOC).
- [x] 0 lỗi TypeScript, 0 kiểu `:any`, 0 ESLint warnings.
- [x] Bộ test toán học định lượng đạt độ bao phủ 100%.
- [x] Test E2E liên hoàn xanh hoàn hảo.
- [x] `npm run build` và `npm test` thành công tuyệt đối.
