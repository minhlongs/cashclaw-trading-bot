# Onboarding & Simulation Guide: Trade-Bot v7 Multi-Pillar Architecture

## 1. Quick Verification (Kiểm Tra Nhanh Bộ Giả Lập v7)
Chạy toàn bộ kịch bản mô phỏng kiểm định 3 trụ cột v7 trong môi trường an toàn tuyệt đối (100% Paper/Deterministic):
```bash
npx vitest run test/quant/v7-full-suite-simulation.test.ts
```

## 2. Các Thành Phần Trọng Tâm v7 (Architecture Core)

### Pillar 1: Avellaneda-Stoikov Dynamic Inventory Engine
- **Vị trí file:** `src/quant/avellaneda-stoikov.ts` & `src/integration/v6-hawkes-connector.ts`
- **Cách thức hoạt động:** Tự động điều chỉnh mức giá đặt lệnh (reservation price $r(s, t)$) và mở rộng spread tương ứng khi phát hiện độc tính luồng lệnh tăng đột biến từ mô hình Hawkes Point Process của v6.

### Pillar 2: CEX/DEX Cross-Domain Basis Arbitrage
- **Vị trí file:** `src/arbitrage/basis-calculator.ts` & `src/execution/cross-domain-executor.ts`
- **Cách thức hoạt động:** Tính toán đường cong trượt giá AMM ($x \cdot y = k$), khấu trừ chi phí gas và phí sàn để tìm kiếm cơ hội chênh lệch giá hai chiều an toàn với cơ chế khóa nguyên tử (Atomic Lock Guard).

### Pillar 3: SABR Volatility Surface Arbitrage
- **Vị trí file:** `src/quant/sabr-engine.ts`, `src/quant/black-76.ts`, và `src/arbitrage/vol-surface-arb.ts`
- **Cách thức hoạt động:** Định giá theo mô hình Hagan SABR (2002) và Black-76, quét độ lệch nụ cười biến động (Volatility Smile) để phát hiện quyền chọn bị định giá sai.

## 3. Cấu Hình & Biến Môi Trường (API Keys & Security)
Hệ thống tuân thủ nghiêm ngặt **ADR-001 (Paper-Only Invariant)**:
- Không gửi bất kỳ lệnh thật nào lên sàn giao dịch.
- Mọi mô phỏng sử dụng WebCrypto native và các hàm thuần túy (pure deterministic functions).
- Kiểm tra cấu hình môi trường tại `.env.example`.

## 4. Giao Diện Terminal HUD
Giao diện Dark Mode Dashboard hiện đã tích hợp thành phần `V7MetricsCard` hiển thị trực quan các thông số thời gian thực từ 3 trụ cột định lượng.
