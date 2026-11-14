# Gate G13 Paper-Forward & Gate G15 Governance Hard-Lock Runbook / Sổ Tay Vận Hành Cổng G13 Paper-Forward & Khóa Cứng Quản Trị G15

- **Document Version / Phiên bản:** `1.0.0`
- **Effective Date / Ngày hiệu lực:** `2026-11-14`
- **Issue Reference / Tham chiếu:** `#63`
- **System Posture / Trạng thái Hệ thống:** `PAPER_ONLY` (`liveTradingUnlocked = false`, `G15 = HARD-LOCKED`)

---

## 1. Purpose & Non-Negotiable Safety Invariants / Mục Đích & Bất Biến An Toàn Tuyệt Đối

### Tiếng Việt
Tài liệu này quy định quy trình vận hành bắt buộc cho đồng hồ kiểm chứng **Gate G13 (60–90 ngày Paper-Forward)** của chiến lược `H3_MAKER` và cơ chế **Khóa Cứng Quản Trị Gate G15 (Independent Human Owner Sign-Off)**.

Bốn bất biến an toàn không thể bị ghi đè bởi bất kỳ tác nhân AI hay mã tự động nào:
1. **Chỉ chạy Paper (`PAPER_ONLY`):** `liveOrderAuthority = false` và `LiveExchange` luôn ở trạng thái `fail-closed` mặc định. Không một lệnh thật nào được phép gửi tới sàn giao dịch.
2. **AI Không Có Quyền Đặt Lệnh (`aiOrderAuthority = false`):** `ResearchAgent` và `tradingagents` chỉ có quyền nghiên cứu đọc-hiểu, hoàn toàn không có phương thức ghi lệnh giao dịch.
3. **Không Ngụy Tạo Thời Gian Quan Sát:** Mọi chu kỳ dưới `60` ngày thực tế (`elapsedDays < 60`, bao gồm Ngày 0 khởi tạo) bắt buộc trả về trạng thái `INCONCLUSIVE` (`g13Pass = false`).
4. **Khóa Cứng Gate G15 (`liveTradingUnlocked = false`):** Ngay cả khi G13 hoàn tất 60–90 ngày với kết quả `PASS` (`< 15.0 bps/tháng`), phần mềm **vẫn giữ `liveTradingUnlocked = false`**. Không phần mềm hay AI agent nào được phép tự mở khóa vốn thật.

### English
This runbook defines the mandatory operational protocol for the **Gate G13 (60–90 day Paper-Forward)** observation clock of `H3_MAKER` and the **Gate G15 Governance Hard-Lock (Independent Human Owner Sign-Off)**.

Four safety invariants cannot be overridden by any AI agent or automated script:
1. **Paper-Only Execution (`PAPER_ONLY`):** `liveOrderAuthority = false`, and `LiveExchange` remains `fail-closed` by default. Zero real exchange orders may be dispatched.
2. **Zero AI Order Authority (`aiOrderAuthority = false`):** `ResearchAgent` and `tradingagents` are strictly read-only advisory modules with zero order-writing methods.
3. **Zero Fabricated Observation Time:** Any window shorter than `60` calendar days (`elapsedDays < 60`, including Day-0 genesis) deterministically evaluates to `INCONCLUSIVE` (`g13Pass = false`).
4. **Gate G15 Hard-Lock (`liveTradingUnlocked = false`):** Even after 60–90 clean forward days produce `verdict = PASS` (`< 15.0 bps/month`), software **unconditionally keeps `liveTradingUnlocked = false`**. Autonomous software can never unlock live capital.

---

## 2. Formal Strategy Archival (`ARCHIVED_FALSIFIED`) / Lưu Trữ Vĩnh Viễn Các Chiến Lược Đã Bị Bác Bỏ

### Tiếng Việt
Năm họ chiến lược dưới đây đã bị bác bỏ thực nghiệm qua kiểm định thống kê G5 (`DSR` tại $N = 185$ phép thử, `PBO` học vẹt, và chi phí khớp lệnh Taker ở G6) và bị **cấm vĩnh viễn** không được bước vào G13:

| Mã Chiến Lược | Trạng Thái Vòng Đời | Lý Do Bác Bỏ & Lưu Trữ (`archive_reason`) | Được Phép Chạy G13 |
|---|---|---|---|
| `H1` | `ARCHIVED_FALSIFIED` | Carry lãi suất funding vĩnh cửu chéo tài sản có đệm trôi (`Drift-Buffered Cross-Sectional Perp Funding Carry`) thất bại kiểm định DSR ở $N=185$ và hòa vốn OOS $< 2.0\times$. | `false` |
| `H2` | `ARCHIVED_FALSIFIED` | Động lượng chuỗi thời gian mục tiêu biến động (`Vol-Targeted Time-Series Momentum`) thất bại kiểm định DSR/PSR và âm ròng ngoài mẫu sau phí. | `false` |
| `H3` | `ARCHIVED_FALSIFIED` | Chênh lệch cơ sở Spot-Perp khớp lệnh **Taker** bị phí taker + trượt giá ăn mòn toàn bộ lợi suất funding ròng (`DSR = 0.1827 < 0.95` ở $N=185$). | `false` |
| `H1_G1` | `ARCHIVED_FALSIFIED` | Biến thể `H1` kết hợp lớp phủ phòng vệ nhân quả biến động/tương quan `G1` không vượt ngưỡng DSR $0.95$ ở $N=185$ và OOS BE $< 2.0\times$. | `false` |
| `H2_G1` | `ARCHIVED_FALSIFIED` | Biến thể `H2` kết hợp lớp phủ phòng vệ nhân quả `G1` cắt giảm lỗ khủng hoảng nhưng vẫn không tạo lợi thế ròng ngoài mẫu (`DSR = 0.0 < 0.95`). | `false` |
| `H3_MAKER` | `PAPER_FORWARD_ELIGIBLE` | Chiến lược duy nhất đủ điều kiện bước vào đồng hồ quan sát G13 (Spot-Perp Basis Cash-and-Carry đặt lệnh Maker chọn lọc, hiệu chuẩn từ sổ lệnh L2 & `aggTrades` mili-giây). | `true` |

**Hàng rào chặn kép (Dual Kill Fence):**
- **Tầng Artifact (`artifacts/strategy_lifecycle_registry.json`):** Lưu danh mục vòng đời kèm chữ ký `registry_sha256` chuẩn RFC-6234 và cờ `live_trading_locked: true`.
- **Tầng Runtime (`src/tree/paper-forward/spec-guard.ts`):** Hằng số cứng `ARCHIVED_FALSIFIED_FAMILIES = ['H1', 'H2', 'H3', 'H1_G1', 'H2_G1']` kết hợp kiểm tra động trên sổ đăng ký. Mọi nỗ lực nạp các chiến lược này vào `PaperForwardRunner` lập tức bị chặn với mã lỗi `STRATEGY_ARCHIVED_FALSIFIED`.

### English
The five strategy families below were empirically falsified across Gate G5 statistical testing (`DSR` across $N = 185$ trials, `PBO` overfitting diagnostics, and Gate G6 taker TCA) and are **permanently barred** from Gate G13:

| Strategy ID | Lifecycle Status | Empirical Falsification Reason (`archive_reason`) | G13 Allowed |
|---|---|---|---|
| `H1` | `ARCHIVED_FALSIFIED` | Drift-buffered cross-sectional perpetual funding carry failed $N=185$ DSR threshold and `< 2.0x` OOS break-even gate. | `false` |
| `H2` | `ARCHIVED_FALSIFIED` | Asset-conditional volatility-targeted time-series momentum (TSMOM) failed DSR/PSR gates with negative net locked-OOS Sharpe. | `false` |
| `H3` | `ARCHIVED_FALSIFIED` | **Taker-executed** spot-perp basis carry failed $N=185$ DSR (`0.1827 < 0.95`) once realistic taker fees and spread crossing were charged. | `false` |
| `H1_G1` | `ARCHIVED_FALSIFIED` | `H1`funding carry with causal `G1` volatility/correlation defensive overlay failed $N=185$ DSR hurdle (`< 0.95`) and OOS cost survival. | `false` |
| `H2_G1` | `ARCHIVED_FALSIFIED` | `H2` TSMOM with causal `G1` defensive overlay cut crisis drawdown yet failed $N=185$ DSR hurdle (`0.0 < 0.95`) with zero OOS edge. | `false` |
| `H3_MAKER` | `PAPER_FORWARD_ELIGIBLE` | Sole candidate eligible for G13 observation: selective passive maker spot-perp cash-and-carry calibrated against millisecond L2 `bookDepth` + `aggTrades`. | `true` |

**Dual Kill Fence Enforcement:**
- **Artifact Layer (`artifacts/strategy_lifecycle_registry.json`):** Pins each strategy status alongside `live_trading_locked: true` and canonical `registry_sha256`.
- **Runtime Layer (`src/tree/paper-forward/spec-guard.ts`):** Hard-pins `ARCHIVED_FALSIFIED_FAMILIES = ['H1', 'H2', 'H3', 'H1_G1', 'H2_G1']` plus dynamic registry verification. Any attempt to instantiate `PaperForwardRunner` with an archived family throws `PaperForwardGuardError('STRATEGY_ARCHIVED_FALSIFIED')`.

---

## 3. SignedStrategySpec Integrity & Architecture Boundary / Toàn Vẹn Đặc Tả Ký Số & Ranh Giới Kiến Trúc

### Tiếng Việt
Trước khi chạy bất kỳ ngày giả lập Paper-Forward nào, `validateSignedStrategySpec` kiểm tra nghiêm ngặt tệp `artifacts/signed_strategy_spec_h3_maker.json`:
1. `executionMode === "PAPER_ONLY"` (nếu khác -> chặn với `LIVE_AUTHORITY_FORBIDDEN`).
2. `liveOrderAuthority === false` (nếu `true` -> chặn với `LIVE_AUTHORITY_FORBIDDEN`).
3. `aiOrderAuthority === false` (nếu `true` -> chặn với `AI_AUTHORITY_FORBIDDEN`).
4. `strategyId` không nằm trong danh sách lưu trữ `ARCHIVED_FALSIFIED` và được cấp phép trong `StrategyLifecycleRegistry`.
5. `payloadSha256` khớp tuyệt đối với mã băm SHA-256 (RFC-6234) trên chuỗi JSON chuẩn hóa sắp xếp khóa từ điển (tương thích 100% với `json.dumps(obj, sort_keys=True, separators=(",", ":"))` của Python). Mọi chỉnh sửa trái phép thông số (`entryAnnualBps`, `fifoFillProbability`, `adverseSelectionBps`, `singleLegMissProbability`, `maxGrossLeverage`) đều bị chặn với `SPEC_SIGNATURE_MISMATCH`.

Mô-đun `src/tree/paper-forward/` hoàn toàn thuần khiết (pure TypeScript): không phụ thuộc `@/ee/*`, `@/forest/*`, `@/land/*`, `node:fs`, `fetch`, hay bộ khớp lệnh thật.

### English
Before executing any Paper-Forward tick, `validateSignedStrategySpec` enforces five fail-closed checks on `artifacts/signed_strategy_spec_h3_maker.json`:
1. `executionMode === "PAPER_ONLY"` (otherwise rejects with `LIVE_AUTHORITY_FORBIDDEN`).
2. `liveOrderAuthority === false` (otherwise rejects with `LIVE_AUTHORITY_FORBIDDEN`).
3. `aiOrderAuthority === false` (otherwise rejects with `AI_AUTHORITY_FORBIDDEN`).
4. `strategyId` passes both the hard-pinned `ARCHIVED_FALSIFIED_FAMILIES` fence and dynamic `StrategyLifecycleRegistry` eligibility.
5. `payloadSha256` matches the synchronous RFC-6234 SHA-256 digest of recursive sorted-key canonical JSON (100% byte-compatible with Python `json.dumps(obj, sort_keys=True, separators=(",", ":"))`). Any parameter tampering triggers `SPEC_SIGNATURE_MISMATCH`.

All code under `src/tree/paper-forward/` is pure Open-Core TypeScript with zero imports from `@/ee/*`, `@/forest/*`, `@/land/*`, `node:fs`, `fetch`, or live exchange adapters, verified continuously by `tests/architecture/arch_boundary_check.test.ts`.

---

## 4. Gate G13 60–90 Day Clock & Weekly Reconciliation / Vận Hành Đồng Hồ 60–90 Ngày G13 & Đối Soát Hàng Tuần

### Tiếng Việt
### 4.1 Kiến trúc thực thi Paper-Forward (`H3_MAKER`)
Mỗi bước ngày trong `PaperForwardRunner` kết hợp ba động cơ độc lập:
- **`CapitalProtectionEngine` (G7/G8):** Kiểm tra độ tươi dữ liệu (`staleDataCutoffMs = 15000`), giới hạn sụt giảm vốn mềm/cứng (`8.0%` / `12.0%`), lỗ ngày tối đa (`2.5%`), và trần đòn bẩy gộp (`1.0x`).
- **`PaperOrderLifecycleEngine` (G9):** Quản lý vòng đời lệnh `limit` với khóa chống trùng lặp `idempotencyKey` riêng cho từng ngày/cặp/chân (`spot` và `perp`), mô phỏng xác suất khớp hàng đợi FIFO (`fifoFillProbability`), trượt giá bất lợi sau khớp (`adverseSelectionBps`), và xác suất lỡ một chân (`singleLegMissProbability` xử lý bằng lệnh đồng bộ khẩn cấp tính phí taker + nửa chênh lệch giá).
- **`MicroDoubleEntryLedger` (G10):** Kế toán kép chính xác bằng số nguyên `BigInt` micro-USD ($10^{-6}$ USD) và đơn vị cơ sở ($10^{-8}$), hạch toán đầy đủ phí maker/taker và dòng tiền funding `8h`/`1h` của vị thế short perp. Cuối mỗi ngày, hệ thống xuất bản ghi bất biến `PaperForwardCheckpoint` nối chuỗi băm `checkpointSha256`.

### 4.2 Quy trình vận hành hàng ngày & đối soát hàng tuần
1. **Khởi tạo Ngày 0 (Genesis):** Chạy kịch bản đối chiếu phía Python (`verification_lab/scripts/g13_paper_forward.py`) để ghi nhận ảnh chụp thị trường công khai không cần khóa API (Binance + Hyperliquid) và checkpoint Ngày 0 vào `artifacts/g13_paper_tracking_error.json` (`elapsed_days: 0`, `status: "OBSERVATION_ACTIVE_INCONCLUSIVE"`, `g13_pass: false`, `live_trading_unlocked: false`).
2. **Tích lũy hàng ngày / hàng tuần (Ngày 1 → Ngày 90):** Ghi nhận chuỗi `PaperForwardCheckpoint` nối tiếp theo thời gian thực (append-only, tuyệt đối không viết lùi hoặc giả lập ngày tương lai).
3. **Đối soát sai số bám sát (`TrackingErrorReconciler`):** Hàng tuần, đối chiếu chuỗi NAV của `PaperForwardRunner` (`paperNav`) với chuỗi NAV độc lập từ bộ giải Python `Decimal` event-ledger (`oracleNav`):
   - Sai lệch lợi suất ngày: $\Delta r_t = r_{\text{paper}, t} - r_{\text{oracle}, t}$
   - Sai số tuyệt đối trung bình quy đổi tháng: $\text{MAE}_{\text{mo}} = \overline{|\Delta r_t|} \times 30 \times 10{,}000 \text{ (bps/tháng)}$
   - Sai số căn phương sai quy đổi tháng: $\text{RMSE}_{\text{mo}} = \sigma(\Delta r_t) \times \sqrt{30} \times 10{,}000 \text{ (bps/tháng)}$
   - Chỉ số quyết định cổng G13: $\text{TE}_{\text{mo}} = \max(\text{MAE}_{\text{mo}}, \text{RMSE}_{\text{mo}})$

### 4.3 Bảng tiêu chí phán quyết G13 & Dừng khẩn cấp (Auto-Kill)

| Điều Kiện Quan Sát | Phán Quyết (`verdict`) | `g13Pass` | `autoKillTriggered` | `liveTradingUnlocked` | Hành Động Bắt Buộc |
|---|---|---|---|---|---|
| Bất kỳ lệch sổ kế toán kép (`ledgerBreachCount > 0`) hoặc vi phạm bảo vệ vốn (`protectionViolationCount > 0`) | `FAIL` | `false` | `true` | `false` | **DỪNG NGAY LẬP TỨC.** Phong tỏa chiến lược, kiểm toán lại sổ cái `BigInt` và dừng đồng hồ G13. |
| Sai số bám sát $\text{TE}_{\text{mo}} \ge 25.0 \text{ bps/tháng}$ (ở mọi thời điểm) | `INCONCLUSIVE` (`<60d`) hoặc `FAIL` (`>=60d`) | `false` | `true` | `false` | **KÍCH HOẠT AUTO-KILL.** Mô hình khớp lệnh Paper lệch quá xa thực tế/oracle; hủy chu kỳ G13 và hiệu chuẩn lại L2 TCA. |
| `elapsedDays < 60` và không có vi phạm sổ cái/bảo vệ vốn | `INCONCLUSIVE` | `false` | `false` (nếu `<25 bps`) | `false` | Tiếp tục quan sát tích lũy đủ tối thiểu `60` ngày (mục tiêu `90` ngày). |
| `elapsedDays >= 60`, không vi phạm, nhưng $15.0 \le \text{TE}_{\text{mo}} < 25.0 \text{ bps/tháng}$ | `FAIL` | `false` | `false` | `false` | **KHÔNG ĐẠT G13.** Không được trình lên G15; phải điều tra nguồn lệch phí/funding/hàng đợi. |
| `elapsedDays >= 60` (mục tiêu `90`), `0` vi phạm, và $\text{TE}_{\text{mo}} < 15.0 \text{ bps/tháng}$ | `PASS` | `true` | `false` | **`false`** | Hoàn tất G13 kỹ thuật; **vốn thật vẫn bị KHÓA CỨNG ở G15** chờ Chủ sở hữu xét duyệt độc lập. |

### English
### 4.1 Paper-Forward Execution Architecture (`H3_MAKER`)
Each daily tick in `PaperForwardRunner` composes three deterministic engines:
- **`CapitalProtectionEngine` (G7/G8):** Enforces market-data freshness (`staleDataCutoffMs = 15000`), soft/hard drawdown breakers (`8.0%` / `12.0%`), rolling daily loss limit (`2.5%`), and gross leverage cap (`1.0x`).
- **`PaperOrderLifecycleEngine` (G9):** Manages deterministic `limit` orders with per-day/symbol/leg `idempotencyKey` deduplication, modeling FIFO queue fill lag (`fifoFillProbability`), post-fill adverse markout (`adverseSelectionBps`), and passive single-leg misses (`singleLegMissProbability`, resolved via immediate emergency taker hedge Synchronization at `perpTakerBps` + half-spread).
- **`MicroDoubleEntryLedger` (G10):** Executes exact integer `BigInt` micro-USD ($10^{-6}$) and base-unit ($10^{-8}$) double-entry accounting across spot/perp legs and `8h`/`1h` funding intervals, emitting hash-chained immutable `PaperForwardCheckpoint` records.

### 4.2 Daily Clock Operation & Weekly Reconciliation
1. **Day-0 Genesis:** `verification_lab/scripts/g13_paper_forward.py` captures a zero-auth public market snapshot (Binance + Hyperliquid) and writes Day-0 genesis to `artifacts/g13_paper_tracking_error.json` (`elapsed_days: 0`, `status: "OBSERVATION_ACTIVE_INCONCLUSIVE"`, `g13_pass: false`, `live_trading_unlocked: false`).
2. **Append-Only Forward Accumulation (Day 1 → Day 90):** Checkpoints are appended strictly in real calendar time with monotonic timestamps and SHA-256 hash chaining. Backdating or synthetic fast-forwarding is prohibited.
3. **Weekly Tracking-Error Reconciliation (`TrackingErrorReconciler`):** Reconciles `PaperForwardRunner` NAV (`paperNav`) against the independent Python `Decimal` event-ledger oracle (`oracleNav`):
   - Daily return discrepancy: $\Delta r_t = r_{\text{paper}, t} - r_{\text{oracle}, t}$
   - Monthly Mean Absolute Tracking Error: $\text{MAE}_{\text{mo}} = \overline{|\Delta r_t|} \times 30 \times 10{,}000 \text{ (bps/month)}$
   - Monthly Root-Mean-Square Dispersion: $\text{RMSE}_{\text{mo}} = \sigma(\Delta r_t) \times \sqrt{30} \times 10{,}000 \text{ (bps/month)}$
   - Governing G13 metric: $\text{TE}_{\text{mo}} = \max(\text{MAE}_{\text{mo}}, \text{RMSE}_{\text{mo}})$

### 4.3 Gate G13 Decision Matrix & Automatic Kill Criteria

| Observed Condition | `verdict` | `g13Pass` | `autoKillTriggered` | `liveTradingUnlocked` | Mandatory Operator Action |
|---|---|---|---|---|---|
| Any double-entry imbalance (`ledgerBreachCount > 0`) or risk-engine breach (`protectionViolationCount > 0`) | `FAIL` | `false` | `true` | `false` | **IMMEDIATE HALT.** Quarantine strategy, audit `BigInt` journal entries, and reset G13 clock after fix. |
| Tracking error $\text{TE}_{\text{mo}} \ge 25.0 \text{ bps/month}$ (at any elapsed day) | `INCONCLUSIVE` (`<60d`) or `FAIL` (`>=60d`) | `false` | `true` | `false` | **AUTO-KILL TRIGGERED.** Simulator diverges materially from oracle; abort G13 run and recalibrate L2 queue model. |
| `elapsedDays < 60` with zero ledger or protection breaches | `INCONCLUSIVE` | `false` | `false` (if `<25 bps`) | `false` | Continue passive paper observation until `>= 60` days (target `90` days). |
| `elapsedDays >= 60`, zero breaches, $15.0 \le \text{TE}_{\text{mo}} < 25.0 \text{ bps/month}$ | `FAIL` | `false` | `false` | `false` | **G13 REJECTED.** Do not advance to G15 review; diagnose fee/funding/queue drift. |
| `elapsedDays >= 60` (target `90`), zero breaches, $\text{TE}_{\text{mo}} < 15.0 \text{ bps/month}$ | `PASS` | `true` | `false` | **`false`** | Technical G13 satisfied; **live trading stays HARD-LOCKED under Gate G15** pending human owner audit. |

---

## 5. Gate G15 Governance Hard-Lock Protocol / Giao Thức Khóa Cứng Quản Trị Gate G15

### Tiếng Việt
Hoàn thành Gate G13 **không đồng nghĩa** với việc được phép giao dịch tiền thật. Gate G15 là hàng rào quản trị con người độc lập:
1. **Khóa cứng trong mã nguồn:** Trường `liveTradingUnlocked` trong `TrackingErrorReconciliationReport` có kiểu tĩnh `false` (`readonly liveTradingUnlocked: false`) và `LiveExchange` mặc định ném ngoại lệ `Live trading is disabled (fail-closed)`.
2. **Không ủy quyền cho AI / CI:** Không một AI agent, cron job, hay pipeline CI/CD nào được phép sửa `liveExecutionEnabled`, nạp API key có quyền giao dịch, hoặc tự ký biên bản nghiệm thu G15.
3. **Điều kiện xét duyệt thủ công Ngày 90 của Chủ sở hữu (Human Owner Day-90 Review):**
   - Kiểm tra độc lập chuỗi 90 ngày trong `artifacts/g13_paper_tracking_error.json` và đối chiếu chữ ký `spec_sha256` với `artifacts/signed_strategy_spec_h3_maker.json`.
   - Xác nhận $\text{TE}_{\text{mo}} < 15.0 \text{ bps/tháng}$, `ledgerBreachCount === 0`, `protectionViolationCount === 0`, và tỷ lệ lỡ chân đơn thực tế không vượt ngưỡng hiệu chuẩn L2.
   - Xác nhận hoàn tất kiểm toán bảo mật đa người dùng (G11) và diễn tập khôi phục sự cố (G9/G10).
   - Chủ sở hữu con người ký biên bản phê duyệt độc lập bên ngoài quyền hạn của hệ thống tác nhân tự động trước khi xem xét bất kỳ thử nghiệm vốn thật quy mô siêu nhỏ nào trong tương lai.

### English
Passing Gate G13 **never** authorizes live capital deployment. Gate G15 is a strictly human-governed institutional lock:
1. **Compile-Time & Runtime Hard-Lock:** `TrackingErrorReconciliationReport.liveTradingUnlocked` is typed as literal `false`, and `LiveExchange` throws `Live trading is disabled (fail-closed)` unless explicit human-configured risk, kill-switch, and durable pre-trade audit gates are wired in a separate human-authored change.
2. **Zero Autonomous Agent Authority:** No AI coding agent, research agent, scheduled worker, or CI workflow may flip live execution flags, provision trading API secrets, or self-certify Gate G15.
3. **Mandatory Day-90 Human Owner Review Checklist:**
   - Independently verify the unbroken 60–90 day hash-chained `checkpoints` in `artifacts/g13_paper_tracking_error.json` and match `spec_sha256` against `artifacts/signed_strategy_spec_h3_maker.json`.
   - Confirm $\text{TE}_{\text{mo}} < 15.0 \text{ bps/month}$, `ledgerBreachCount === 0`, `protectionViolationCount === 0`, and realized passive fill / leg-miss rates remain within G6 millisecond L2 bounds.
   - Confirm multi-tenant security gates (G11) and durable order recovery drills (G9/G10) remain green.
   - Execute manual written sign-off by the human system owner strictly outside autonomous agent authority.

---

## 6. Verification Commands / Lệnh Kiểm Chứng Định Kỳ

```bash
npx vitest run tests/paper-forward/g13_paper_forward.test.ts tests/architecture/arch_boundary_check.test.ts src/tree/__tests__/open-core-boundary.test.ts --coverage
npx tsc --noEmit
npx eslint src/tree/paper-forward/ tests/paper-forward/ tests/architecture/ --max-warnings 0
npx knip
```
