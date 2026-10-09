# Brainstorming Report: Triad v19 Apex Multi-Domain Suite

## Problem Statement & Requirements
Nền tảng giao dịch định lượng CashClaw (Paper Trading & Alpha Research OS) liên tục mở rộng các thư viện QuantLib vi cấu trúc thị trường, ước lượng biến động nâng cao và tối ưu hoá kiến trúc mã nguồn.
Sau khi hoàn thành Triad v18 (Cont-Kukanov Optimal Placement, Hayashi-Yoshida Asynchronous Lead-Lag, và Modular hoá 3 file $\le 82$ LOC), hệ thống bước vào chu kỳ Triad v19 Apex Suite nhằm đáp ứng:
1. **Biến động đa thành phần không chệch (Unbiased Volatility Estimation)**: Các chỉ số biến động Close-to-Close thông thường bỏ qua biến động qua đêm (overnight gaps) và biến động trong phiên (intraday price range High-Low), dẫn đến ước lượng sai lệch lớn khi thị trường biến động mạnh. Cần tích hợp **Yang-Zhang (2000) Drift-Independent Volatility Estimator** kết hợp cả Garman-Klass, Rogers-Satchell và Open-to-Close jumps.
2. **Đo lường Vi cấu trúc và Vi giá cân bằng dòng lệnh (Microstructure & Micro-Price Estimation)**: Giá mid-price $P_{\text{mid}} = (P_a + P_b) / 2$ hoặc giá khớp gần nhất không phản ánh xác suất di chuyển giá ngắn hạn. Cần tích hợp **Stoikov (2018) Order Flow Imbalance (OFI) Micro-Price Engine** tính toán vi giá kỳ vọng $P^*$ dựa trên bất cân xứng sổ lệnh cấp 1 (Level-1 Imbalance) kết hợp luồng hủy lệnh và hấp thụ thanh khoản.
3. **Quản trị Kích thước Tệp Nguồn (Strict LOC Governance < 85 LOC)**:
   - File `src/tree/alpha/observability/attribution.ts` hiện tại (140 LOC) cần được phân rã thành các helper tính toán chi phí / trượt giá (`attribution-cost-calculators.ts`) và facade điều phối chính $\le 85$ LOC.
   - File `src/tree/alpha/observability/order-generator.ts` hiện tại (139 LOC) cần được phân rã thành module kiểm tra tính hợp lệ (`order-generator-validators.ts`) và logic sinh lệnh bóng $\le 85$ LOC.

---

## Evaluated Approaches

### Trụ cột 1: Ước lượng Biến động Đa thành phần
- **Phương án A: Parkinson (1980) hoặc Garman-Klass (1980)**:
  - *Ưu điểm*: Tận dụng High-Low (Parkinson) và High-Low-Open-Close (Garman-Klass).
  - *Nhược điểm*: Giả định không có bước nhảy mở cửa (Zero overnight jump). Sai lệch lớn trong thị trường Crypto 24/7 khi các nến phiên có gap hoặc biến động bước nhảy giá.
- **Phương án B: Yang-Zhang (2000) Drift-Independent Minimum-Variance Estimator (Được chọn)**:
  - Tính toán độc lập 3 thành phần:
    - Biến động mở cửa $\sigma_o^2 = \text{Var}(\ln(O_t / C_{t-1}))$
    - Biến động đóng cửa $\sigma_c^2 = \text{Var}(\ln(C_t / O_t))$
    - Biến động Rogers-Satchell $\sigma_{\text{RS}}^2 = \frac{1}{N} \sum [\ln(H_t/C_t)\ln(H_t/O_t) + \ln(L_t/C_t)\ln(L_t/O_t)]$
  - Kết hợp với trọng số tối thiểu hóa phương sai $k$:
    $$\sigma_{\text{YZ}}^2 = \sigma_o^2 + k \cdot \sigma_c^2 + (1 - k) \cdot \sigma_{\text{RS}}^2, \quad k = \frac{0.34}{1.34 + (N + 1)/(N - 1)}$$
  - Độc lập hoàn toàn với drift và không thiên lệch trong mọi điều kiện thị trường.

### Trụ cột 2: Vi giá Sổ lệnh (Micro-Price Engine)
- **Phương án A: Weighted Mid-Price thông thường**:
  - $P_{\text{wmid}} = \frac{V_b P_a + V_a P_b}{V_a + V_b}$. Dễ bị nhiễu do lệnh ảo (spoofing) và không phản ánh tỷ lệ dịch chuyển giá kỳ vọng có điều kiện.
- **Phương án B: Sasha Stoikov (2018) Markovian Micro-Price Engine (Được chọn)**:
  - Tính toán tỷ lệ mất cân bằng dòng lệnh $I = \frac{V_b - V_a}{V_b + V_a} \in [-1, 1]$.
  - Ước lượng xác suất dịch chuyển nấc giá tiếp theo và tính vi giá kỳ vọng:
    $$P^* = P_b + S \cdot G(I, S)$$
    với $G(I, S)$ là hàm điều chỉnh vi giá phi tuyến tính có trọng số dựa trên độ co giãn của spread và độ bất đối xứng khối lượng.

### Trụ cột 3: Tái cấu trúc & Module hoá sâu (< 85 LOC/file)
- **Phương án thực hiện**:
  1. `attribution.ts` (140 LOC):
     - Trích xuất `resolveRealizedNetReturn`, `calculateCostAdjustment`, `computeSlippageBps` vào `attribution-cost-calculators.ts` (khoảng 65 LOC).
     - Giữ `attribution.ts` còn $\le 80$ LOC cho orchestration và type re-exports.
  2. `order-generator.ts` (139 LOC):
     - Trích xuất `validateOrderGenerationParams` và logic tiền xử lý trọng số vào `order-generator-validators.ts` (khoảng 60 LOC).
     - Giữ `order-generator.ts` còn $\le 80$ LOC.

---

## Final Recommended Solution
Thực thi toàn diện 3 trụ cột theo chuẩn Apex Suite:
1. `src/tree/quantlib/volatility/yang-zhang-volatility-types.ts` & `yang-zhang-volatility-engine.ts` ($\le 85$ LOC).
2. `src/tree/quantlib/microstructure/stoikov-microprice-types.ts` & `stoikov-microprice-engine.ts` ($\le 85$ LOC).
3. Tách mô-đun `attribution-cost-calculators.ts` và `order-generator-validators.ts` để đưa `attribution.ts` và `order-generator.ts` về $\le 80$ LOC.
4. Xây dựng bộ test toàn diện: Unit tests cho 2 engine mới và E2E simulation test `test/quant/v19-apex-suite-simulation.test.ts`.

---

## Success Metrics & Validation
- Giữ vững 5,525+ bài test hiện có, 100% test pass.
- 0 lỗi TypeScript, 0 `:any`, 0 cảnh báo ESLint.
- Mọi tệp mã nguồn tạo mới hoặc được tái cấu trúc đều $\le 85$ LOC.
- Next.js production build (`npm run build`) hoàn thành sạch.
