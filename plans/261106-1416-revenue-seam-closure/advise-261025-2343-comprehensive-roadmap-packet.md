# Evidence Packet — CashClaw Comprehensive Roadmap & Architecture (`ak:advise --ultra`)

Date: 2026-10-25
Repo: `minhlongs/cashclaw-trading-bot` (/Users/macbook/trade-bot)
Mode: `ak:advise --ultra` (Best-of-5 Verifier Mode)
Controller: Primary Agent (Opus 5)

---

## 1. Context & User Directives
- **Original User Input**: `/Users/macbook/trade-bot --ultra`
- **User Preference**: Tiếng Việt prose, English technical identifiers/terms.
- **Goal Statement**: Khi được hỏi chọn 1 trong 4 mục tiêu (Consolidation types, Integration QuantLib, Git/CI Cleanup, SaaS Commercialization), người dùng chọn **"cả 4"** theo chiến lược **"Phân kỳ 4 Giai đoạn tuần tự (Recommended)"**.
- **Preview & Reframing**: Đã được người dùng xác nhận thông qua câu hỏi AskUserQuestion.

---

## 2. Verified Codebase Ground Truth (Measured by Commands)

### P1: QuantLib Types Consolidation
- `src/tree/quantlib/microstructure/` đã hoàn thành gộp: từ 132 file production xuống **75 file production** (6 stem blocked được giữ nguyên).
- `src/tree/quantlib/execution/` hiện có:
  - Tổng số file production: **75 file** (`.ts`, không tính test).
  - Tổng số `*-types.ts`: **37 file**.
  - Single-producer types (chỉ có đúng 1 file production import): **36 file**.
  - Blocked types (≥2 production importers): **1 file** (`cartea-jaimungal-types.ts`, được import bởi cả `execution/cartea-jaimungal-engine.ts` và `marketmaking/cartea-jaimungal-engine.ts`).
  - Test importers trong `test/` hoặc `tests/`: 4 test files import types.
  - Value exports trong 37 file types: **0** (thuần `interface`/`type`, không có class, const, function).
  - Max LOC sau khi gộp 36 cặp: **72 LOC** (`gueant-tapia`, 36 + 36), hoàn toàn dưới trần 120 LOC của repo.
  - Sau khi gộp 36 file: `src/tree/quantlib/execution/` sẽ giảm từ **75 file xuống 39 file production**.
- Script `scripts/merge-microstructure-types.mjs` và `scripts/count-type-importers.mjs` có thể mở rộng đường dẫn quét sang `execution/`.

### P2: Git Hygiene, Worktrees & Untracked Files
- **Branch status**:
  - `feat/alpha-research-os-phase7`: ahead=0, behind=253 so với `main` (đã merge qua PR #6/squash hoặc tích hợp).
  - `feat/alpha-research-os-phase8`: ahead=0, behind=252.
  - `feat/alpha-research-os-phase9`: ahead=0, behind=251.
  - `feat/alpha-research-os-phase10`: ahead=0, behind=249.
  - Cả 4 branch này hoàn toàn obsolete (ahead=0), an toàn để xoá nhánh local/remote.
- **Worktrees**:
  - `/Users/macbook/trade-bot` (main)
  - `/Users/macbook/trade-bot-worktrees/knip-cleanup` (detached HEAD, task đã xong)
  - `/Users/macbook/trade-bot-worktrees/microstructure-type-consolidation` (PR #16 đã merge)
  - Cả 2 worktrees này là stale processes/directories cần prune.
- **Untracked files trong repo**:
  - Có 7 file trong `plans/reports/` từ phiên advise trước:
    - `advise-261024-1146-structural-consolidation-candidate-1.md` .. `5.md`
    - `advise-261024-1146-structural-consolidation-packet.md`
    - `advise-261024-1146-structural-consolidation-verdict.md`

### P3: SaaS Billing & IPN End-to-End Real Seam
- `src/ee/` sở hữu Commercial License và 25-step SaaS moat:
  - Entitlement Store: `src/ee/billing/saas-entitlement-store.ts` (hỗ trợ dual D1 + memory).
  - NOWPayments IPN: `src/app/api/ee/billing/nowpayments-ipn/route.ts` (đã có HMAC-SHA512 verification + tier upgrade vào `defaultSaasEntitlementStore`).
  - Quotas API: `GET /api/ee/quotas` đọc qua `resolveWorkspaceTierContext`.
  - Credits API: `GET /api/ee/credits` đọc qua `defaultCreditLedgerStore`.
- **Hiện trạng Frontend Billing Page** (`src/app/[locale]/(dashboard)/billing/page.tsx`):
  - Đang dùng hardcoded state: `useState<SaasTier>('BASIC')`, `runningBots={1}`, `consumedCredits={250}`, `totalCredits={1000}`.
  - Cần hydrate trực tiếp từ `GET /api/ee/quotas` và `GET /api/ee/credits`.
  - Kết nối checkout modal với webhook trigger để test end-to-end.

### P4: Bot Strategy QuantLib Engine Integration
- Hiện tại bot execution engine (`src/tree/bot/strategies/`) có 3 chiến lược:
  - `grid.ts` (Grid trading)
  - `mean-reversion.ts` (Mean reversion)
  - `volatility-dca.ts` (Volatility-adjusted DCA — đã nối QuantLib `volatilityDca`)
- Hệ thống `@cashclaw/quantlib` có hơn 30 engine toán học cao cấp (Almgren-Chriss, VPIN, Hawkes jump process, Hamilton regime-switching, Lyons rough path...).
- Mục tiêu: Tích hợp sâu các engine định lượng (ví dụ Almgren-Chriss optimal execution hoặc VPIN toxicity guard) vào bot execution cycle hoặc signal fence, duy trì nghiêm ngặt nguyên tắc **ADR-001 Paper-Only Invariant** (không gọi live order CEX).

---

## 3. Confirmed Reframing & Acceptance Criteria

### Problem Reframed
CashClaw Trade Bot đã đạt được bước tiến lớn sau đợt hợp nhất microstructure types (PR #16) và CI gate fix (PR #24). Tuy nhiên, codebase vẫn đang đối mặt với 4 vấn đề tích tụ: (1) 37 file types phân mảnh tại `quantlib/execution/` làm phình cấu trúc; (2) 4 branch cũ và 2 worktrees mồ côi gây nhiễu git graph; (3) Giao diện SaaS Billing vẫn dùng state giả lập chưa đọc từ D1/EE store; (4) Kho vũ khí toán học đồ sộ của QuantLib chưa được khai thác triệt để trong chu trình bot paper-trading thực tế.

### Exact Requirements (4 Phases)
1. **P1 — Execution Types Consolidation**: Gộp 36 file `*-types.ts` đơn importer trong `src/tree/quantlib/execution/` vào consumer trực tiếp, giữ nguyên 1 file blocked (`cartea-jaimungal-types.ts`), đảm bảo 100% file sau gộp $\le 120$ LOC, 0 export value bị thất lạc.
2. **P2 — Git Hygiene & Process Cleanup**: Xoá an toàn 4 branch stale (`feat/alpha-research-os-phase7..10`), prune 2 worktree mồ côi, dọn dẹp các untracked report files.
3. **P3 — SaaS Billing Hydration**: Hydrate trang Billing từ real API endpoints (`/api/ee/quotas`, `/api/ee/credits`), kết nối flow nâng cấp hạng tài khoản qua D1 `saas_workspace_entitlements`.
4. **P4 — QuantLib Bot Integration**: Cắm ít nhất 1 engine định lượng tiêu biểu (Almgren-Chriss TWAP/VWAP execution hoặc Microstructure OFI/VPIN guard) vào bot execution loop hoặc paper provider adapter, tuân thủ ADR-001.

### Done Means
- `src/tree/quantlib/execution/` giảm từ 75 xuống đúng 39 file production; 0 file vượt 120 LOC.
- `git branch -a` và `git worktree list` sạch sẽ, không còn branch stale và worktree mồ côi.
- Trang `/billing` hiển thị đúng tier và credit thực tế từ workspace context.
- Bot paper trade áp dụng engine QuantLib trong tính toán khối lượng/giá đặt lệnh.
- Toàn bộ quality gates: `npm run type-check`, `npm run lint`, `npm test` (hơn 6.000 tests) đều PASS 100%, 0 warnings, 0 `:any`.

### Non-Goals
- Tuyệt đối không bật live order trading với tiền thật (ADR-001 paper-only invariant).
- Không refactor các types file có $\ge 2$ importer hoặc có chứa class/value exports phức tạp.
- Không thay đổi hợp đồng public SDK `@cashclaw/quantlib` (`public-sdk.ts`).

---

## 4. Candidate Task & Rubric
- **Candidate Task**: Lập bản tư vấn kỹ thuật toàn diện, khách quan, trung thực (Step 5 của `ak:advise`) theo cấu trúc chuẩn:
  1. Verdict
  2. What you should do (theo 4 giai đoạn cụ thể)
  3. What you shouldn't do (cảnh báo bẫy, rủi ro)
  4. What could be better / more efficient
  5. My take and how to get there (lộ trình từng bước chi tiết)
  6. Benefits & Trade-offs
  7. Work checklist, Success metrics & Handoff brief
- **Language**: Tiếng Việt văn phong kỹ thuật chuẩn xác, mã nguồn/file/định danh giữ nguyên tiếng Anh.
- **Rubric (1-20 mỗi tiêu chí, tổng 100)**:
  1. Faithfulness to requirements / non-goals (Bám sát 4 Phase & Done means).
  2. Evidence grounding (Số liệu, đường dẫn file, lệnh kiểm chứng chính xác từ codebase).
  3. Honesty of trade-offs (Chỉ rõ chi phí, rủi ro, không tô hồng).
  4. Actionability (Checklist, Metrics, Handoff brief có thể bàn giao ngay cho executor).
  5. Language & Structure (Tiếng Việt mạch lạc, cấu trúc hoàn chỉnh).
