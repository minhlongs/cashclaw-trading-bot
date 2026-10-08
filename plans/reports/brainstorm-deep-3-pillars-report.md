# Brainstorming Deep Report: Kiến Trúc Hợp Nhất 3 Trụ Cột Nâng Cao (Autonomous Alpha Swarm × L2 Microstructure Simulator × Multi-Venue Basis Arb)

**Ngày lập:** 2026-10-08  
**Trạng thái:** Hoàn thành đồng thuận kiến trúc (Consensus Achieved)  
**Phạm vi hệ thống:** Trade-Bot (Paper-only v1, Edge-Native WebCrypto, Cloudflare Workers D1)

---

## 1. Bài toán & Mục tiêu Cốt lõi (Problem Statement)
Hệ thống Trade-Bot đã hoàn thành trọn vẹn:
1. Nền tảng Alpha Research OS (Phase 1–10: Data Quality, Survival Gate, Multi-testing, Observability).
2. Tích hợp trực tiếp REST client WebCrypto không phụ thuộc CCXT trên Binance, OKX, Bybit.
3. Cầu nối Deliberation Multi-Agent và HUD Terminal kiểm soát khẩn cấp.

**Thách thức lớn tiếp theo:**
- Các chiến lược định hướng (directional alphas) dễ bị bão hòa hoặc quá khớp (overfitting).
- Mô hình khớp lệnh giả lập cũ (bar-based/tick-based) chưa phản ánh chính xác độ trượt giá (slippage) và độ trễ hàng đợi thực tế (queue priority) của thị trường crypto.
- Cần khai thác triệt để lợi thế phi định hướng (Delta-neutral / Basis & Funding Arbitrage) trên 3 sàn hàng đầu để tạo ra dòng lợi nhuận ổn định, đồng thời vận hành quy trình tự động hóa nghiên cứu 24/7.

---

## 2. Kiến trúc 3 Trụ Cột Hợp Nhất (Tri-Pillar Synergy Architecture)

### Trụ Cột 1: Multi-Venue Basis & Funding Rate Arbitrage Engine
- **Mục tiêu:** Khai thác chênh lệch Funding Rate và Basis Spread giữa Spot và Perpetual Futures trên Binance, OKX, Bybit mà không chịu rủi ro giá biến động.
- **Thiết kế phân lớp:**
  - `src/tree/exchange/arbitrage/funding-monitor.ts`: Bộ chuẩn hóa và theo dõi Funding Rate đa sàn.
  - `src/tree/exchange/arbitrage/basis-spread-calculator.ts`: Tính toán chênh lệch giá giao ngay vs hợp đồng tương lai vĩnh cửu.
  - `src/forest/alpha/arbitrage/delta-neutral-strategy.ts`: Bộ phát sinh tín hiệu mở đồng thời 2 vị thế đối ứng (Long vị thế âm / Short vị thế dương) khi $\Delta \text{Funding} > 2 \times \text{Fees}$.
  - Hoàn toàn tuân thủ ADR-001 (Paper Mode Only).

### Trụ Cột 2: L2 Microstructure Realistic Paper Execution Simulator
- **Mục tiêu:** Nâng cấp Paper Exchange với khả năng phản ánh chân thực vi cấu trúc thị trường và trượt giá.
- **Thiết kế phân lớp:**
  - `src/tree/exchange/simulator/l2-orderbook-engine.ts`: Mô phỏng Order Book Depth mức 20 với snapshot L2 từ Binance/OKX/Bybit.
  - `src/tree/exchange/simulator/queue-priority-tracker.ts`: Tính toán vị trí hàng đợi limit order dựa trên tích lũy khối lượng `aggTrades`.
  - `src/tree/exchange/simulator/market-impact-slippage.ts`: Áp dụng mô hình tác động giá Almgren-Chriss / Kyle's Lambda để tính toán trượt giá thực tế theo thanh khoản tức thời.

### Trụ Cột 3: Autonomous Alpha Lab Swarm (24/7 Self-Paced Research)
- **Mục tiêu:** Hệ thống tự động nghiên cứu, đề xuất giả thuyết và kiểm định liên tục.
- **Thiết kế phân lớp:**
  - `src/forest/research/swarm/swarm-scheduler.ts`: Kích hoạt định kỳ qua Cloudflare Cron / Inngest.
  - `src/forest/research/swarm/market-anomaly-detector.ts`: Phát hiện biến động bất thường (Funding spikes, Liquidation cascades, Volume breakout).
  - Tích hợp 2 chiều: Kích hoạt `compileDebateHypotheses` $\rightarrow$ `AlphaResearchPipeline` $\rightarrow$ `runSurvivalGate` $\rightarrow$ `transitionStrategy`.
  - Kiểm soát Overfitting: Áp dụng Deflated Sharpe Ratio (DSR) và phạt số lần kiểm thử lũy kế ($N$).

---

## 3. Đánh giá Rủi ro & Giải pháp Phòng vệ (Risk Assessment & Mitigations)
1. **Rủi ro Overfitting (Data Snooping):**  
   *Giải pháp:* Tích hợp Deflated Sharpe Ratio và giới hạn nghiêm ngặt số lượng thử nghiệm mỗi ngày; Survival Gate bắt buộc fail-closed.
2. **Rủi ro Giới hạn Tài nguyên Edge Runtime (Cloudflare Workers):**  
   *Giải pháp:* Thiết kế Hybrid L2 Engine — sử dụng Edge Polling định kỳ kết hợp D1/KV Cache cho dữ liệu snapshot; duy trì file $\le 200$ LOC và thuật toán nhẹ tính toán trong microsecond.
3. **Rủi ro Phá vỡ Invariant An toàn:**  
   *Giải pháp:* Cố định type-level `AUTOMATED_CEILING = 'SHADOW' as const`, ngăn chặn mọi hành vi tự động đẩy lệnh lên Live khi chưa có can thiệp của con người.

---

## 4. Kế hoạch Triển khai (Next Steps & Milestones)
1. **Giai đoạn 1 (Basis & Funding Arb):** Xây dựng module trích xuất Funding Rate và Basis Spread trên 3 sàn, viết bộ test 100% không mock data giả.
2. **Giai đoạn 2 (L2 Fill Simulator):** Tích hợp Queue Priority và Almgren-Chriss Slippage vào PaperExchange.
3. **Giai đoạn 3 (Autonomous Swarm):** Nối Scheduler với Deliberation Pipeline Bridge để vận hành nghiên cứu tự động.
