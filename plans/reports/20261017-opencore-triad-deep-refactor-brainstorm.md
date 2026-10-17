# Đề xuất Brainstorm Chuyên sâu (--deep): Tái Cấu trúc Toàn diện Triad (SaaS API/UI + Test Slicing + Public CLI DX)

**Mã đề xuất:** `BRAINSTORM-OPENCORE-TRIAD-REFACTOR-20261017`  
**Dự án:** CashClaw AI Trading Bot Platform (`/Users/macbook/trade-bot`)  
**Mục tiêu:** Thực thi đồng thời cả 3 trọng tâm kiến trúc sau đợt tái cấu trúc 25 bước Open-Core:
1. **Cụm 1 (SaaS UI/API Integration):** Tích hợp các module `src/ee/` (RBAC, QuotaGuard, NOWPayments IPN, Local-to-Cloud Sync) vào App Router API routes và Server Actions.
2. **Cụm 2 (Test Suite Deep Slicing):** Cắt nhỏ các monolith test files khổng lồ (>500 LOC) thành các submodule test độc lập <= 250 LOC theo chuẩn clean architecture.
3. **Cụm 3 (Public SDK Packaging & CLI DX):** Cung cấp CLI nhị phân `cashclaw` (`bin/cashclaw.js`), lệnh `npm run quickstart`, và hướng dẫn sử dụng nhanh cho cộng đồng định lượng.

---

## 1. Phân Tích Hiện Trạng & Động Lực (Why & What)

### Cụm 1: Hào Kinh Tế Chưa Nối Liền App Router (SaaS UI/API Gap)
- Hiện tại, các module tại `src/ee/` (`tenant-policy.ts`, `quota-guard.ts`, `nowpayments-ipn.ts`, `local-to-cloud-sync.ts`) đã có đầy đủ logic nghiệp vụ và unit tests (100% green).
- Tuy nhiên, các route API tại `src/app/api/bots/route.ts` và các server action chưa gọi `assertCanCreateBot` từ `quota-guard.ts` để chặn người dùng khi vượt hạn mức gói (ví dụ: `BASIC` tối đa 2 bot, `PREMIUM` tối đa 10 bot).
- Cần có:
  - Route endpoint cho NOWPayments IPN webhook: `src/app/api/ee/billing/ipn/route.ts`.
  - Route endpoint cho Local-to-Cloud Sync Bridge: `src/app/api/ee/sync/route.ts`.
  - Route endpoint cho Quota Status & Entitlements: `src/app/api/ee/quotas/route.ts`.
  - Tích hợp kiểm tra quota vào `src/app/api/bots/route.ts`.

### Cụm 2: Nợ Kỹ Thuật Test Monoliths (Test Suite Deep Slicing)
- Các file test > 500 LOC hiện tại:
  1. `src/forest/alpha/research-agent/__tests__/e2e-research-agent.test.ts` (1,501 LOC): Tập trung quá nhiều kịch bản E2E kiểm thử chu trình nghiên cứu alpha.
  2. `src/tree/bot/bot-manager.test.ts` (1,022 LOC): Gom lẫn lifecycle, error handling, queue dispatching, và tick handling.
  3. `src/tree/alpha/signals/funding.test.ts` (696 LOC): Trộn lẫn tính toán funding rate thô, regime shifts, và edge cases.
  4. `src/components/dashboard/dashboard-client.test.tsx` (642 LOC): Gom render widgets, KPI cards, ticker websockets.
  5. `src/forest/api/handlers/daily-stats.test.ts` (624 LOC): Gom aggregation, timezone edge cases, và error branches.
- Rủi ro: Thời gian chạy test đơn lẻ bị kéo dài, khó khoanh vùng lỗi regression khi refactor production code.
- Giải pháp: Chia tách thành các sub-test suite chuyên biệt (< 250 LOC/file) với facade runner tương thích ngược.

### Cụm 3: Developer Experience Cho Cộng Đồng GitHub (Public SDK & CLI DX)
- Gói mã nguồn mở `@cashclaw/quantlib` và `@cashclaw/alpha-zoo` đã xuất public SDK nhưng chưa có executable CLI command để người dùng chạy trực tiếp từ terminal.
- Giải pháp:
  - Bổ sung `bin/cashclaw.js` vào `package.json` (`"bin": { "cashclaw": "./bin/cashclaw.js" }`).
  - Thêm script `npm run quickstart` chạy mô phỏng 3 cặp tài sản (`quickstart-fixture.ts`) và in bảng báo cáo (`paper-cli-report.ts`).
  - Cung cấp tài liệu `docs/developer-quickstart.md` hướng dẫn step-by-step cho lập trình viên.

---

## 2. Kiến Trúc Đề Xuất Cho 3 Cụm (Triad Architecture)

### 2.1 Cụm 1: SaaS API & UI Integration Pipeline
```
Client (Web / CLI)
       │
       ▼
[Next.js App Router API Routes / Server Actions]
       │
       ├─► [QuotaGuard: assertCanCreateBot / assertCanRunBacktest] ── (Throw QUOTA_WALL_HIT if exceeded)
       │
       ├─► [/api/ee/billing/ipn] ──► [validateNowPaymentsIpnSignature (HMAC-SHA512)] ──► [applyBillingUpgrade]
       │
       ├─► [/api/ee/sync] ──► [verifyAndImportSyncBundle (SHA-256 Checksum)] ──► [Restore Bot Workspace]
       │
       └─► [/api/ee/quotas] ──► [getWorkspaceEntitlements] ──► { tier: 'PREMIUM', maxBots: 10, ... }
```

### 2.2 Cụm 2: Test Suite Slicing Taxonomy
- **`bot-manager.test.ts` (1,022 LOC) chia thành:**
  - `bot-manager-lifecycle.test.ts` (~250 LOC) — init, start, stop, pause.
  - `bot-manager-queue.test.ts` (~220 LOC) — queue prioritization, backpressure, tick lease.
  - `bot-manager-persistence.test.ts` (~230 LOC) — D1 hydration, crash recovery.
  - `bot-manager-errors.test.ts` (~200 LOC) — network disconnects, invalid state transitions.
- **`e2e-research-agent.test.ts` (1,501 LOC) chia thành:**
  - `research-agent-pipeline.test.ts` (~280 LOC) — prompt to AST parsing.
  - `research-agent-deliberation.test.ts` (~260 LOC) — multi-agent debate arbitration.
  - `research-agent-validation.test.ts` (~270 LOC) — causal walk-forward verification.
  - `research-agent-persistence.test.ts` (~250 LOC) — alpha zoo catalog persistence.

### 2.3 Cụm 3: CLI Launcher & Developer Journey
- File: `bin/cashclaw.js`
  - Nhận tham số CLI: `cashclaw quickstart`, `cashclaw backtest --pair BTC/USDT`, `cashclaw sync export`.
  - Hỗ trợ cờ `--json` để tích hợp CI/CD của cộng đồng.
  - Tự động hiển thị conversion CTA khi kết thúc phiên mô phỏng.

---

## 3. Khung Kế Hoạch Đề Xuất (3 Phases / 15 Steps)

### Phase 1: SaaS API Routes & Server Actions Integration (Steps 1–5)
- **Step 1:** Tạo `src/app/api/ee/quotas/route.ts` cung cấp thông tin hạn mức workspace theo tier.
- **Step 2:** Tạo `src/app/api/ee/billing/ipn/route.ts` xử lý webhook NOWPayments IPN có rate-limiting và HMAC validation.
- **Step 3:** Tạo `src/app/api/ee/sync/route.ts` hỗ trợ upload và verify Local-to-Cloud Sync Bundle.
- **Step 4:** Tích hợp `QuotaGuard` vào `src/app/api/bots/route.ts` và Server Actions tạo bot.
- **Step 5:** Viết integration test `src/app/api/ee/__tests__/ee-routes.test.ts`.

### Phase 2: Test Suite Deep Slicing & Quality Preservation (Steps 6–10)
- **Step 6:** Cắt nhỏ `bot-manager.test.ts` thành 4 sub-suites độc lập (< 250 LOC).
- **Step 7:** Cắt nhỏ `funding.test.ts` (696 LOC) thành 3 sub-suites tính toán và regime.
- **Step 8:** Cắt nhỏ `dashboard-client.test.tsx` (642 LOC) thành 3 test suites UI chuyên biệt.
- **Step 9:** Cắt nhỏ `daily-stats.test.ts` (624 LOC) thành 3 test suites phân tích số liệu.
- **Step 10:** Chạy lại toàn bộ test suite đảm bảo 100% tests green, thời gian chạy giảm >= 20%.

### Phase 3: Public SDK Packaging, CLI Binary & DX (Steps 11–15)
- **Step 11:** Tạo CLI executable `bin/cashclaw.js` với các lệnh `quickstart`, `eval`, `export-sync`.
- **Step 12:** Thêm script `"quickstart": "tsx bin/cashclaw.js quickstart"` vào `package.json`.
- **Step 13:** Viết unit test `bin/__tests__/cashclaw-cli.test.ts` kiểm thử CLI arguments và output.
- **Step 14:** Biên soạn `docs/developer-quickstart.md` (Song ngữ Việt/Anh) với hướng dẫn 3 phút.
- **Step 15:** Kiểm định toàn bộ Quality Gates (`npm run build`, `npm run lint`, `npm test`).

---

## 4. Cam Kết Tiêu Chuẩn & Không Phá Vỡ (Safety Invariants)
- **Zero `:any` types**, TypeScript biên dịch thành công 0 lỗi.
- Mọi file code tạo mới hoặc refactor đều **dưới 150 LOC** (nghiêm ngặt < 200 LOC per Development Rules).
- **ADR-001:** Tuyệt đối không thêm logic giao dịch tiền thật (Paper Trading Only).
- Không thêm bất kỳ dòng `eslint-disable` mới nào.
- 0 rò rỉ secret hoặc log console trong production code.
