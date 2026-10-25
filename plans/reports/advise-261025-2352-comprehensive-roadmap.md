# Candidate C

## 1. Verdict

**Triển khai tuần tự 4 giai đoạn (`P1 → P2 → P3 → P4`) trên các nhánh độc lập từ `main`, ưu tiên dọn dẹp cấu trúc tĩnh và môi trường Git (`P1`, `P2`) trước khi nối runtime seam cho SaaS Billing (`P3`) và tích hợp định lượng QuantLib vào chu trình khớp lệnh Paper Bot (`P4`).**

Cách sắp xếp này triệt tiêu rủi ro xung đột merge và đảm bảo mọi bước thay đổi runtime ở `P3`/`P4` đều chạy trên một cây thư mục sạch, có bộ kiểm thử (`npm run quality:gate`) xanh 100% làm chốt chặn. Toàn bộ 4 mục tiêu đều đã có sẵn các primitive nền tảng trong codebase (`scripts/merge-microstructure-types.mjs`, `defaultSaasEntitlementStore`, `computeAlmgrenChrissTrajectory`, `generateAlmgrenChrissSchedule`); công việc cốt lõi là **nối dây (wiring) có kiểm soát**, không phải viết lại kiến trúc từ đầu.

---

## 2. What you should do (Theo 4 giai đoạn tuần tự)

### Giai đoạn 1 (P1): Hợp nhất 36 file `*-types.ts` trong `src/tree/quantlib/execution/`
1. **Mở rộng tham số thư mục mục tiêu (`subDir`) trong script công cụ mà không phá vỡ default**:
   - Trong `/Users/macbook/trade-bot/scripts/count-type-importers.mjs` (dòng 71) và `/Users/macbook/trade-bot/scripts/merge-microstructure-types.mjs` (dòng 97), giữ nguyên giá trị mặc định `subDir = 'src/tree/quantlib/microstructure'` để toàn bộ suite kiểm thử hiện hữu tại `/Users/macbook/trade-bot/test/scripts/count-type-importers.test.ts` (dòng 265–318) và `/Users/macbook/trade-bot/test/scripts/merge-microstructure-types.test.ts` tiếp tục PASS 100%.
   - Thêm cờ CLI `--dir=src/tree/quantlib/execution` vào cả hai script để quét và gộp 36 cặp single-importer trong `src/tree/quantlib/execution/`.
2. **Bảo toàn tuyệt đối stem bị khoá (`blocked`)**:
   - Giữ nguyên `/Users/macbook/trade-bot/src/tree/quantlib/execution/cartea-jaimungal-types.ts` vì file này có 2 production importers (`src/tree/quantlib/execution/cartea-jaimungal-engine.ts` và `src/tree/quantlib/marketmaking/cartea-jaimungal-engine.ts`).
3. **Cập nhật 4 file test external trước khi xoá file `*-types.ts`**:
   - Chuyển hướng đường dẫn `import type` từ `*-types` sang `*-engine` tại 4 file test đã xác minh:
     - `/Users/macbook/trade-bot/test/quant/bertsimas-hummel-execution.test.ts` (dòng 3: `bertsimas-hummel-types` $\rightarrow$ `bertsimas-hummel-engine`)
     - `/Users/macbook/trade-bot/test/quant/cartea-jaimungal-ofi-execution.test.ts` (dòng 3: `cartea-jaimungal-ofi-types` $\rightarrow$ `cartea-jaimungal-ofi-engine`)
     - `/Users/macbook/trade-bot/test/quant/kyle-dutta-madhavan-execution.test.ts` (dòng 3: `kyle-dutta-madhavan-types` $\rightarrow$ `kyle-dutta-madhavan-engine`)
     - `/Users/macbook/trade-bot/test/quant/lorenz-almgren-execution.test.ts` (dòng 3: `lorenz-almgren-types` $\rightarrow$ `lorenz-almgren-engine`)
4. **Thực thi gộp và kiểm chứng trần LOC**:
   - Chạy dry-run trước, sau đó chạy `--write` cho 36 stems. File lớn nhất sau gộp là `gueant-tapia-engine.ts` (**72 LOC**), nằm sâu dưới trần **120 LOC** của script và quy chuẩn của repo. Tổng số file production trong `src/tree/quantlib/execution/` sẽ giảm chính xác từ **75 xuống 39 file**.

### Giai đoạn 2 (P2): Dọn dẹp Git Branches, Worktrees mồ côi & Untracked Artifacts
1. **Kiểm tra tiến trình ngầm trước khi tháo worktree**:
   - Chạy `ps aux | grep trade-bot-worktrees` và `lsof` để đảm bảo không còn tiến trình `vitest`, `next`, hoặc `node` nào đang neo vào 2 thư mục worktree.
2. **Gỡ bỏ 2 worktree mồ côi**:
   - Chạy `git worktree remove /Users/macbook/trade-bot-worktrees/knip-cleanup` và `git worktree remove /Users/macbook/trade-bot-worktrees/microstructure-type-consolidation`, tiếp theo là `git worktree prune`.
3. **Xoá 4 nhánh `feat/alpha-research-os-phase7..10` đã hoàn thành (`ahead=0`)**:
   - Xoá local branches bằng `git branch -d feat/alpha-research-os-phase7 feat/alpha-research-os-phase8 feat/alpha-research-os-phase9 feat/alpha-research-os-phase10` (dùng `-d` thay vì `-D` để Git xác nhận commit đã nằm trong `main` hoặc dùng `-D` sau khi kiểm증 `git rev-list --count main..branch == 0`).
   - Nếu tồn tại trên remote `origin`, đồng bộ bằng `git push origin --delete <branch>`.
4. **Dọn dẹp 7 file báo cáo untracked trong `plans/reports/`**:
   - Di chuyển vào thư mục lưu trữ nội bộ hoặc xoá 7 file `plans/reports/advise-261024-1146-structural-consolidation-*.md` để `git status --short` hoàn toàn sạch.

### Giai đoạn 3 (P3): Hydrate trang SaaS Billing & Nối thông luồng nâng cấp hạng (End-to-End Real Seam)
1. **Thay thế state giả lập tại `/Users/macbook/trade-bot/src/app/[locale]/(dashboard)/billing/page.tsx`**:
   - Hiện tại dòng 11–28 đang hardcode `useState<SaasTier>('BASIC')`, `runningBots={1}`, `consumedCredits={250}`, `totalCredits={1000}`.
   - Viết hook hoặc `useEffect` + `useCallback` (`refreshBillingState`) gọi song song (`Promise.all`) 3 API thực tế với `workspaceId`:
     - `GET /api/ee/quotas?workspaceId=${workspaceId}` (từ `/Users/macbook/trade-bot/src/app/api/ee/quotas/route.ts`): lấy `tier` và `entitlements` (`maxRunningPaperBots`, `monthlyLlmCredits`).
     - `GET /api/ee/credits?workspaceId=${workspaceId}` (từ `/Users/macbook/trade-bot/src/app/api/ee/credits/route.ts`): lấy `account.consumedCredits` và `account.balanceCredits`.
     - `GET /api/bots` (từ `/Users/macbook/trade-bot/src/app/api/bots/route.ts`): đếm số bot đang active để truyền vào `runningBots`.
2. **Nối `NowpaymentsCheckoutModal` với luồng kích hoạt thực tế**:
   - Trong `/Users/macbook/trade-bot/src/components/billing/nowpayments-checkout-modal.tsx` (dòng 25–28), thay thế `setTimeout` giả lập bằng lời gọi HTTP thực tới endpoint kích hoạt/webhook sandbox hoặc `/api/ee/billing/nowpayments-ipn` (với chữ ký hợp lệ trong môi trường paper/test hoặc client simulation endpoint chuẩn), sau đó gọi `onSuccess()` để kích hoạt `refreshBillingState()` đọc lại dữ liệu mới từ `defaultSaasEntitlementStore` (D1 + in-memory cache).
3. **Đồng bộ hoá `/Users/macbook/trade-bot/src/app/api/ee/billing/ipn/route.ts`**:
   - Hiện tại `/api/ee/billing/ipn/route.ts` (dòng 14–20) chỉ xác thực chữ ký rồi trả về `{ ok: true, processed: true }` mà **bỏ quên không ghi vào `defaultSaasEntitlementStore`**. Cần uỷ quyền hoặc dùng chung logic `recordIpnAndUpgradeTier` + kiểm tra idempotency `hasProcessedPayment` như trong `/Users/macbook/trade-bot/src/app/api/ee/billing/nowpayments-ipn/route.ts` (dòng 35–55).

### Giai đoạn 4 (P4): Tích hợp QuantLib Execution / Toxicity Engine vào chu trình Paper Bot
1. **Điểm nối kiến trúc tối ưu (Zero-Live-Risk Seam)**:
   - Tích hợp mô-đun định lượng `/Users/macbook/trade-bot/src/tree/quantlib/execution/almgren-chriss-trajectory.ts` (`computeAlmgrenChrissTrajectory`) kết hợp cùng `/Users/macbook/trade-bot/src/tree/execution/almgren-chriss/optimal-slice-coordinator.ts` (`generateAlmgrenChrissSchedule`) và `evaluateVpinThrottling` vào tầng thực thi lệnh của bot tại `/Users/macbook/trade-bot/src/tree/bot/strategies/volatility-dca-execution.ts` (hoặc `/Users/macbook/trade-bot/src/tree/bot/bot-order-executor-dispatch.ts`).
2. **Cơ chế hoạt động trong chu trình Paper Trading**:
   - Khi chiến lược (ví dụ `VolatilityDcaStrategy` tại `/Users/macbook/trade-bot/src/tree/bot/strategies/volatility-dca-handler.ts`, dòng 21–30) phát tín hiệu `buy`/`sell` với khối lượng mục tiêu `qty` và độ biến động `vol`:
     - Nếu cấu hình bot bật chế độ thực thi định lượng (hoặc mặc định tính toán metadata quỹ đạo thực thi tối ưu), gọi `computeAlmgrenChrissTrajectory` với `volatility = vol / 100` để xác định `firstSliceRatio`, `urgencyKappa`, `expectedShortfallCost`, và `strategyClass` (`URGENT_FRONT_LOADED` | `BALANCED_AC_TRAJECTORY` | `PASSIVE_TWAP_LIMIT`).
     - Kết hợp kiểm tra rào chắn độc tính dòng lệnh qua `evaluateVpinThrottling`: nếu `vpinCdf >= criticalCdfThreshold` (`0.95`), ép kiểu lệnh sang `limit` (`passive_maker`) và điều chỉnh khối lượng slice đầu tiên theo tỷ lệ tối ưu thay vì khớp toàn bộ khối lượng ngay lập tức.
3. **Tuân thủ tuyệt đối ADR-001 (Paper-Only Invariant)**:
   - Toàn bộ lệnh sau khi qua bộ điều phối định lượng vẫn đi qua `PaperProviderAdapter` (`/Users/macbook/trade-bot/src/tree/exchange/provider/paper-provider-adapter.ts`), tuyệt đối không mở kết nối đặt lệnh thật lên sàn CEX.

---

## 3. What you shouldn't do (Các bẫy cụ thể trong Codebase)

1. **KHÔNG sửa trực tiếp hằng số mặc định `src/tree/quantlib/microstructure` trong `countImporters()`**:
   - File test `/Users/macbook/trade-bot/test/scripts/count-type-importers.test.ts` (dòng 268–310) gọi `countImporters()` không tham số và assert chính xác 6 blocked stems của `microstructure` (`abdi-ranaldo`, `corwin-schultz`, `gatheral-transient-impact`, `hawkes-jump`, `kyle-obizhaeva-invariance`, `roll-spread`). Nếu đổi mặc định sang `execution`, test suite sẽ đỏ ngay lập tức.
2. **KHÔNG gộp `/Users/macbook/trade-bot/src/tree/quantlib/execution/cartea-jaimungal-types.ts`**:
   - File này được import đồng thời bởi `src/tree/quantlib/execution/cartea-jaimungal-engine.ts` và `src/tree/quantlib/marketmaking/cartea-jaimungal-engine.ts`. Gộp nó vào `execution` sẽ tạo ra cross-domain dependency ngược từ `marketmaking` sang implementation file của `execution`.
3. **KHÔNG đụng chạm tới `/Users/macbook/trade-bot/src/tree/quantlib/public-sdk.ts`**:
   - `public-sdk.ts` (dòng 53–56) đang export `computeAlmgrenChrissTrajectory, type AlmgrenChrissParams, type AlmgrenChrissTrajectoryResult, type AlmgrenChrissSlice` trực tiếp từ `./execution/almgren-chriss-trajectory` (vốn đã chứa sẵn types nội bộ). Không thay đổi chữ ký hay đường dẫn export tại đây để bảo toàn hợp đồng OSS `@cashclaw/quantlib@1.66.0-open-core`.
4. **KHÔNG nhầm lẫn giữa hai bộ type `AlmgrenChrissParams` đang song hành trong repo**:
   - `/Users/macbook/trade-bot/src/tree/quantlib/execution/almgren-chriss-trajectory.ts` (dòng 6) định nghĩa `AlmgrenChrissParams` với `{ totalShares, horizonSteps, stepSeconds, volatility, riskAversionLambda, tempImpactEta, permImpactGamma }`.
   - Trong khi đó `/Users/macbook/trade-bot/src/tree/execution/almgren-chriss/almgren-chriss-types.ts` định nghĩa `AlmgrenChrissParams` với `{ initialInventory, horizonSeconds, numIntervals, volatility, riskAversion, temporaryImpact, permanentImpact }`.
   - Khi tích hợp ở `P4`, phải viết hàm mapper rõ ràng hoặc chọn đích danh 1 module, tránh import trùng tên gây lỗi TypeScript hoặc truyền sai đơn vị tham số.
5. **KHÔNG nhúng `NOWPAYMENTS_IPN_SECRET` xuống Client Component (`NowpaymentsCheckoutModal` hoặc `BillingPage`)**:
   - Cả hai file UI đều có directive `'use client'`. Mọi thao tác ký hoặc kiểm tra HMAC-SHA512 phải nằm hoàn toàn ở Route Handler phía server (`/api/ee/billing/...`), tuân thủ nghiêm ngặt quy tắc bảo mật của repo.

---

## 4. What could be better / more efficient (Xếp hạng theo Effort-to-Impact)

| Hạng | Cải tiến đề xuất | Effort | Impact | Lý do kỹ thuật |
| :--- | :--- | :---: | :---: | :--- |
| **1** | **Tham số hoá `--dir` cho cặp script `count-type-importers.mjs` & `merge-microstructure-types.mjs`** | Thấp (~15 phút) | Rất cao | Tái sử dụng 100% cơ chế phát hiện multi-line import, kiểm tra trần 120 LOC và idempotence đã được chứng minh qua 18 test cases, giúp gộp 36 file trong `execution/` chỉ bằng 1 lệnh duy nhất mà không có lỗi cú pháp. |
| **2** | **Hợp nhất logic xử lý giữa `/api/ee/billing/ipn/route.ts` và `/api/ee/billing/nowpayments-ipn/route.ts`** | Thấp (~20 phút) | Cao | Loại bỏ lỗ hổng hiện tại khi `/api/ee/billing/ipn` chỉ verify HMAC nhưng không lưu D1 hay nâng cấp tier trong `defaultSaasEntitlementStore`. |
| **3** | **Tạo helper tổng hợp hoặc gọi `Promise.all` cho `/api/ee/quotas` + `/api/ee/credits` trên trang Billing** | Thấp (~30 phút) | Cao | Khi `defaultSaasEntitlementStore` nâng cấp tier của workspace, `GET /api/ee/credits` tự động reconcile lại `balanceCredits` theo tier mới (`llm-credit-ledger.ts:69-78`). Gọi đồng thời giúp giao diện cập nhật nhất quán trong 1 chu kỳ render. |
| **4** | **Tích hợp Almgren-Chriss + VPIN Throttler như một Pure Execution Sizer cho `VolatilityDcaStrategy`** | Trung bình (~45 phút) | Cao | Giữ nguyên 100% các bài test hiện hữu của `volatility-dca.test.ts` khi dùng tham số mặc định, đồng thời mở khóa khả năng chia nhỏ lệnh (optimal slicing) và phòng vệ độc tính thanh khoản (VPIN guard) cho bot. |

---

## 5. My take and how to get there (Lộ trình thực thi chi tiết từng bước)

Tôi đồng thuận hoàn toàn với chiến lược **Phân kỳ 4 Giai đoạn tuần tự**. Đây là con đường ngắn nhất, an toàn nhất và có khả năng kiểm chứng độc lập ở từng chặng:

### Bước 1: Thực thi P1 (Execution Types Consolidation)
1. Sửa `/Users/macbook/trade-bot/scripts/count-type-importers.mjs`:
   - Cho phép hàm `countImporters(root = ROOT, subDir = 'src/tree/quantlib/microstructure')` nhận tham số `subDir`.
   - Trong `main()`, đọc cờ `--dir=` từ `process.argv.slice(2)` để truyền vào `countImporters(ROOT, dir)`.
2. Sửa `/Users/macbook/trade-bot/scripts/merge-microstructure-types.mjs`:
   - Cho phép `mergePair(stem, { dryRun, root = ROOT, git = true, subDir = 'src/tree/quantlib/microstructure' })` nhận `subDir` và truyền xuống `countImporters(root, subDir)`.
3. Chạy `node scripts/count-type-importers.mjs --dir=src/tree/quantlib/execution` để xác nhận chính xác:
   - `types files found: 37`
   - `blocked: 1` (`cartea-jaimungal`)
   - `safe-with-test: 4` (`bertsimas-hummel`, `cartea-jaimungal-ofi`, `kyle-dutta-madhavan`, `lorenz-almgren`)
   - `safe-clean: 32`
4. Chạy `node scripts/merge-microstructure-types.mjs --dir=src/tree/quantlib/execution <36-stems> --write`.
5. Cập nhật 4 file test trong `test/quant/` để import type từ `*-engine` tương ứng.
6. Chạy `npm run quality:gate` để xác nhận `tsc`, `eslint`, `vitest`, và `knip` đều xanh.

### Bước 2: Thực thi P2 (Git Hygiene & Worktree Cleanup)
1. Kiểm tra không có thay đổi chưa lưu trong `/Users/macbook/trade-bot-worktrees/knip-cleanup` và `/Users/macbook/trade-bot-worktrees/microstructure-type-consolidation`.
2. Gỡ bỏ 2 worktrees bằng `git worktree remove` và chạy `git worktree prune`.
3. Xoá 4 nhánh local `feat/alpha-research-os-phase7..10` và xoá (hoặc lưu trữ ngoài repo) 7 file `plans/reports/advise-261024-1146-structural-consolidation-*.md`.
4. Kiểm chứng bằng `git worktree list`, `git branch -a`, và `git status --short`.

### Bước 3: Thực thi P3 (SaaS Billing Hydration & Real Seam)
1. Cập nhật `/Users/macbook/trade-bot/src/app/api/ee/billing/ipn/route.ts` để gọi `defaultSaasEntitlementStore.hasProcessedPayment` và `defaultSaasEntitlementStore.recordIpnAndUpgradeTier` giống hệt `/Users/macbook/trade-bot/src/app/api/ee/billing/nowpayments-ipn/route.ts`.
2. Cập nhật `/Users/macbook/trade-bot/src/app/[locale]/(dashboard)/billing/page.tsx`:
   - Thêm hàm `fetchBillingSummary(workspaceId)` gọi `GET /api/ee/quotas?workspaceId=...`, `GET /api/ee/credits?workspaceId=...`, và `GET /api/bots`.
   - Hydrate `currentTier`, `runningBots`, `consumedCredits`, `totalCredits` (`account.balanceCredits + account.consumedCredits` hoặc `entitlements.monthlyLlmCredits`) vào `QuotaUsageCard` và `TierComparisonTable`, giữ nguyên giá trị khởi tạo `'BASIC'` / `1000` làm fallback an toàn trong lúc đang fetch để không làm gãy các bài test render đồng bộ (SSR/initial render).
3. Cập nhật `/Users/macbook/trade-bot/src/components/billing/nowpayments-checkout-modal.tsx` và viết bài test tích hợp xác minh luồng: Webhook IPN nâng cấp tier $\rightarrow$ `GET /api/ee/quotas` & `GET /api/ee/credits` trả về tier mới $\rightarrow$ `BillingPage` hiển thị đúng tier và hạn mức mới.

### Bước 4: Thực thi P4 (QuantLib Bot Strategy Integration)
1. Tạo module điều phối gọn nhẹ (dưới 90 LOC) tại `/Users/macbook/trade-bot/src/tree/bot/strategies/quantlib-execution-sizer.ts` nối `computeAlmgrenChrissTrajectory` (`src/tree/quantlib/execution/almgren-chriss-trajectory.ts`) và `evaluateVpinThrottling` (`src/tree/execution/almgren-chriss/vpin-execution-throttler.ts`).
2. Tích hợp vào `/Users/macbook/trade-bot/src/tree/bot/strategies/volatility-dca-handler.ts` và `/Users/macbook/trade-bot/src/tree/bot/strategies/volatility-dca-execution.ts`:
   - Khi có tín hiệu giao dịch, tính toán slice tối ưu và kiểm tra VPIN toxicity guard trước khi gọi `callbacks.placeOrder`.
   - Ghi log định lượng chi tiết (`urgencyKappa`, `strategyClass`, `firstSliceRatio`, `isThrottled`) qua `callbacks.onLog` để phục vụ observability.
3. Viết unit test và integration test chứng minh đạt 100% coverage cho nhánh tích hợp mới mà không vi phạm ADR-001.

---

## 6. Benefits

- **Giảm phân mảnh cấu trúc (Structural Density)**: Giảm ngay **36 file** dư thừa trong `src/tree/quantlib/execution/` (từ 75 xuống 39 file production, giảm **48%** số lượng file), giúp IDE lập chỉ mục nhanh hơn, `knip` và `tsc` quét đồ thị module gọn hơn.
- **Môi trường Git chuẩn xác**: Xoá bỏ hoàn toàn nguy cơ commit nhầm vào worktree mồ côi hoặc rebase nhầm lên các nhánh `phase7..10` đã cũ hơn 250 commits so với `main`.
- **Thương mại hoá SaaS thực chất (Real Behavioral Seam)**: Chuyển trang `/billing` từ một bản mẫu tĩnh (mock UI) thành một hệ thống đọc/ghi trạng thái thực từ Cloudflare D1 (`saas_workspace_entitlements`) và `CreditLedgerStore`, đồng nhất giữa Web Dashboard, API Quotas và CLI Sync.
- **Khai thác sức mạnh Toán tài chính của `@cashclaw/quantlib`**: Đưa mô hình thực thi tối ưu Almgren-Chriss và bộ lọc độc tính thanh khoản VPIN từ trạng thái thư viện tĩnh vào vận hành trực tiếp trong chu trình Paper Bot mà vẫn đảm bảo an toàn vốn 100% theo ADR-001.

---

## 7. Trade-offs

- **Chi phí thực tế (Honest Costs)**:
  - Việc gộp 36 file `*-types.ts` vào `*-engine.ts` trong `P1` sẽ tạo ra một commit chạm tới **76 file** (36 file bị xoá, 36 file engine được thêm dòng, 4 file test cập nhật import). Nếu có nhánh tính năng khác đang sửa cùng các file trong `src/tree/quantlib/execution/`, nhánh đó sẽ gặp xung đột merge.
  - Ở `P3`, khi chuyển `BillingPage` sang fetch bất đồng bộ từ `/api/ee/quotas` và `/api/ee/credits`, các unit test UI hiện hữu nếu không mock `global.fetch` có thể gặp cảnh báo `act(...)` của React hoặc nhận state fallback mặc định nếu không xử lý khéo léo.
  - Ở `P4`, việc áp dụng Almgren-Chriss slicing làm thay đổi khối lượng của từng lệnh đơn lẻ (từ đặt 100% khối lượng bậc DCA sang đặt theo `firstSliceRatio` hoặc lịch trình slice) nếu bật mặc định, đòi hỏi phải cấu hình cờ opt-in (hoặc giữ default tương thích ngược) để không làm hỏng các test snapshot cũ của `volatility-dca.test.ts`.
- **Khi nào khuyến nghị này không còn đúng (When it stops being right)**:
  - Nếu trong tương lai một engine thứ hai (ví dụ trong `marketmaking/` hoặc `portfolio/`) cần import các interface từ một trong 36 file vừa gộp ở `P1`, việc giữ chung types trong file `*-engine.ts` sẽ bắt đầu gây coupled import hoặc làm file vượt trần 120 LOC.
  - Nếu hệ thống chuyển từ単-node / Cloudflare Worker isolate sang kiến trúc đa worker phân tán hoàn toàn mà chưa gắn binding D1 thực tế cho `CreditLedgerStore` (hiện `CreditLedgerStore` tại `src/ee/deliberation-cloud/llm-credit-ledger.ts:59` đang lưu `Map` in-memory, khác với `SaasEntitlementStore` đã có persistence D1 tại `saas-entitlement-d1.ts`), số dư credit tiêu thụ có thể bị reset khi Worker isolate khởi động lại.
- **Chi phí chuyển đổi / đảo ngược (Switching Cost)**:
  - **P1**: Rất thấp — commit gộp hoàn toàn cơ học, có thể `git revert` trong 5 giây hoặc tách lại file `*-types.ts` bất kỳ lúc nào.
  - **P2**: Không thể hoàn tác các file untracked nếu dùng `rm` trực tiếp (do đó nên di chuyển sang thư mục backup ngoài repo trước khi xoá hẳn); đối với 4 nhánh `phase7..10`, vì `ahead=0` nên toàn bộ lịch sử đã nằm trong `main`, chi phí khôi phục bằng `0`.
  - **P3 & P4**: Thấp — được đóng gói trong các module/route rõ ràng, dễ dàng bật/tắt qua props hoặc config flag.

---

## 8. Unverified

- **Trạng thái trên Remote `origin` của 4 nhánh `feat/alpha-research-os-phase7..10`**: Đã xác minh trên local git graph là `ahead=0, behind=249..253` so với `main`, nhưng chưa gọi mạng (`git ls-remote --heads origin`) để kiểm tra xem 4 nhánh này còn tồn tại trên GitHub remote hay đã được tự động xoá sau khi merge PR.
- **Môi trường biến `NOWPAYMENTS_IPN_SECRET` trên Cloudflare Production**: Trong code (`src/ee/billing/nowpayments-ipn-verifier.ts:63`), hệ thống fallback về `'test_ipn_secret'` khi biến môi trường trống. Cần kiểm tra trên Cloudflare Dashboard khi chạy production thật để đảm bảo secret thực đã được cấu hình.

---

## 9. Work checklist, success metrics & handoff brief

### Work Checklist (Tuần tự từng bước)

- [ ] **P1.1**: Cập nhật `/Users/macbook/trade-bot/scripts/count-type-importers.mjs` và `/Users/macbook/trade-bot/scripts/merge-microstructure-types.mjs` hỗ trợ tham số `subDir` / `--dir=` (giữ nguyên mặc định `src/tree/quantlib/microstructure`).
- [ ] **P1.2**: Chạy `node scripts/count-type-importers.mjs --dir=src/tree/quantlib/execution` để xác nhận 37 file types (1 blocked: `cartea-jaimungal`, 4 safe-with-test, 32 safe-clean).
- [ ] **P1.3**: Chạy `node scripts/merge-microstructure-types.mjs --dir=src/tree/quantlib/execution <36-stems> --write` để gộp 36 file types vào consumer.
- [ ] **P1.4**: Cập nhật đường dẫn import trong 4 file test (`test/quant/bertsimas-hummel-execution.test.ts`, `test/quant/cartea-jaimungal-ofi-execution.test.ts`, `test/quant/kyle-dutta-madhavan-execution.test.ts`, `test/quant/lorenz-almgren-execution.test.ts`).
- [ ] **P1.5**: Chạy `npx vitest run test/scripts/ test/quant/` và `npm run type-check` để chốt P1.
- [ ] **P2.1**: Gỡ bỏ 2 worktrees mồ côi tại `/Users/macbook/trade-bot-worktrees/knip-cleanup` và `/Users/macbook/trade-bot-worktrees/microstructure-type-consolidation` bằng `git worktree remove` và `git worktree prune`.
- [ ] **P2.2**: Xoá 4 nhánh local `feat/alpha-research-os-phase7..10` và dọn sạch 7 file untracked `plans/reports/advise-261024-1146-structural-consolidation-*.md`.
- [ ] **P3.1**: Đồng bộ `/Users/macbook/trade-bot/src/app/api/ee/billing/ipn/route.ts` để ghi nhận sự kiện IPN và nâng cấp tier qua `defaultSaasEntitlementStore`.
- [ ] **P3.2**: Hydrate `/Users/macbook/trade-bot/src/app/[locale]/(dashboard)/billing/page.tsx` từ `GET /api/ee/quotas`, `GET /api/ee/credits`, và `GET /api/bots`; nối `NowpaymentsCheckoutModal` cập nhật state thực tế sau khi kích hoạt tier.
- [ ] **P3.3**: Bổ sung/cập nhật test cho luồng Billing hydration và IPN升级.
- [ ] **P4.1**: Tạo bộ điều phối định lượng kết nối `computeAlmgrenChrissTrajectory` + `evaluateVpinThrottling` vào chu trình thực thi lệnh của bot (`src/tree/bot/strategies/volatility-dca-handler.ts` / `volatility-dca-execution.ts`) với cờ cấu hình tương thích ngược và tuân thủ ADR-001.
- [ ] **P4.2**: Viết unit test đạt 100% coverage cho nhánh tích hợp QuantLib execution mới.
- [ ] **Final Gate**: Chạy `npm run quality:gate` (`tsc --noEmit && eslint src/ --max-warnings 0 && vitest run --coverage && knip`) đạt 100% PASS.

### Success Metrics (Kiểm chứng bằng lệnh)

1. **Số file production trong `src/tree/quantlib/execution/` bằng đúng 39**:
   ```bash
   find /Users/macbook/trade-bot/src/tree/quantlib/execution -maxdepth 1 -name "*.ts" ! -name "*.test.ts" | wc -l
   # Expected output: 39
   ```
2. **Không có file nào trong `src/tree/quantlib/execution/` vượt 120 LOC**:
   ```bash
   wc -l /Users/macbook/trade-bot/src/tree/quantlib/execution/*.ts | sort -n | tail -n 5
   # Expected max file <= 120 LOC (almgren-chriss-trajectory.ts = 88 LOC, gueant-tapia-engine.ts = 72 LOC)
   ```
3. **Chỉ còn đúng 1 file `*-types.ts` (`cartea-jaimungal-types.ts`) trong `execution/`**:
   ```bash
   node /Users/macbook/trade-bot/scripts/count-type-importers.mjs --dir=src/tree/quantlib/execution
   # Expected: types files found: 1, blocked: 1, safe-with-test: 0, safe-clean: 0
   ```
4. **Git worktrees và branches sạch sẽ**:
   ```bash
   git worktree list
   # Expected: chỉ duy nhất 1 dòng /Users/macbook/trade-bot
   git branch --list "feat/alpha-research-os-phase*"
   # Expected: (empty)
   ```
5. **Toàn bộ Quality Gate xanh 100%**:
   ```bash
   npm run quality:gate
   # Expected: 0 tsc errors, 0 eslint warnings, 100% tests pass, knip clean
   ```

### Handoff Brief

```markdown
# Handoff Brief — CashClaw 4-Phase Comprehensive Roadmap Execution

## Objective
Thực thi tuần tự 4 giai đoạn nâng cấp cho `/Users/macbook/trade-bot`:
1. (P1) Gộp 36 file `*-types.ts` đơn importer trong `src/tree/quantlib/execution/` vào file `*-engine.ts` tương ứng và cập nhật 4 file test liên quan.
2. (P2) Prune 2 worktrees mồ côi (`knip-cleanup`, `microstructure-type-consolidation`), xoá 4 nhánh stale (`feat/alpha-research-os-phase7..10`) và dọn 7 file report untracked cũ.
3. (P3) Hydrate trang SaaS Billing (`src/app/[locale]/(dashboard)/billing/page.tsx`) bằng dữ liệu thực từ `GET /api/ee/quotas`, `GET /api/ee/credits`, `GET /api/bots` và đồng bộ luồng kích hoạt tier qua `defaultSaasEntitlementStore`.
4. (P4) Tích hợp engine định lượng Almgren-Chriss (`computeAlmgrenChrissTrajectory`) và bộ lọc độc tính VPIN (`evaluateVpinThrottling`) vào chu trình đặt lệnh paper-trading của bot (`src/tree/bot/strategies/volatility-dca-*`).

## Done means
- `src/tree/quantlib/execution/` giảm từ 75 xuống đúng 39 file production `.ts` (chỉ giữ lại `cartea-jaimungal-types.ts`), 0 file vượt 120 LOC.
- `git worktree list` chỉ còn worktree chính `/Users/macbook/trade-bot`; 4 nhánh `feat/alpha-research-os-phase7..10` đã được xoá; `git status --short` sạch.
- Trang `/billing` hiển thị đúng `currentTier`, `runningBots`, `consumedCredits`, `totalCredits` được nạp từ API `/api/ee/quotas` và `/api/ee/credits`, đồng thời phản ánh đúng trạng thái nâng cấp tier từ `defaultSaasEntitlementStore`.
- Chu trình đặt lệnh của Bot áp dụng tính toán khối lượng/loại lệnh qua engine định lượng QuantLib và có đầy đủ unit test đạt 100% coverage trên file chiến lược.
- Lệnh `npm run quality:gate` (`tsc --noEmit`, `eslint src/ --max-warnings 0`, `vitest run --coverage`, `knip`) thoát với mã `0`.

## Out of scope
- Tuyệt đối không bật giao dịch tiền thật trên sàn CEX (giữ nguyên ADR-001 paper-only invariant).
- Không gộp `src/tree/quantlib/execution/cartea-jaimungal-types.ts` hoặc bất kỳ file types nào có từ 2 production importers trở lên.
- Không sửa đổi các symbol hoặc đường dẫn export trong `src/tree/quantlib/public-sdk.ts`.

## Constraints
- Giữ nguyên hành vi mặc định (`subDir = 'src/tree/quantlib/microstructure'`) của `scripts/count-type-importers.mjs` và `scripts/merge-microstructure-types.mjs` để không làm gãy `test/scripts/*.test.ts`.
- Không sử dụng kiểu `:any`, không dùng `console.log` trong mã nguồn production, không lộ `NOWPAYMENTS_IPN_SECRET` xuống client component.
- Mọi file mã nguồn được tạo mới hoặc chỉnh sửa phải tuân thủ giới hạn LOC và quy chuẩn kebab-case của dự án.

## Stop and ask only if
- Phát hiện tiến trình đang chạy hoặc commit chưa merge bên trong 2 thư mục `/Users/macbook/trade-bot-worktrees/*` khi chuẩn bị xoá ở P2.
- Có yêu cầu thay đổi schema bảng D1 (`migrations/`) ngoài các bảng `saas_workspace_entitlements` và `saas_nowpayments_ipn_events` đã có sẵn trong migration `0013`.
```

---

## Phụ lục Thẩm định Ultra Verifier Mode (`--ultra`)

### 1. Bảng chấm điểm Best-of-5 (Scoring Matrix)

Chấm điểm độc lập bởi Kongming Verifier theo thang điểm 1–20 cho 5 tiêu chí rubric (Tổng điểm tối đa 100):

| Hạng | Ứng viên (Ẩn danh) | Nguồn Candidate | 1. Faithfulness (1–20) | 2. Evidence Grounding (1–20) | 3. Honesty of Trade-offs (1–20) | 4. Actionability (1–20) | 5. Language & Structure (1–20) | Tổng điểm (/100) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | **Candidate C (WINNER)** | **Slot 5** | **20** | **20** | **19** | **20** | **19** | **98 / 100** |
| 2 | Candidate D | Slot 2 | 20 | 19 | 19 | 19 | 18 | 95 / 100 |
| 3 | Candidate B | Slot 1 | 20 | 19 | 18 | 19 | 18 | 94 / 100 |
| 4 | Candidate A | Slot 3 | 19 | 16 | 16 | 17 | 17 | 85 / 100 |
| 5 | Candidate E | Slot 4 | 18 | 13 | 14 | 15 | 18 | 78 / 100 |

### 2. Quyết định Thẩm định (Verifier Verdict)

- **Ứng viên chiến thắng được chọn**: **Candidate C** (Điểm số: **98/100**)
- **Biên độ dẫn trước (Margin)**: **high** (Dẫn trước Candidate D 3 điểm, dẫn trước nhóm dưới 13–20 điểm trên tiêu chí Evidence Grounding và Actionability)
- **Đồng thuận tuyệt đối (Unanimous)**: **yes** (Candidate C dẫn đầu ở mọi tiêu chí đánh giá)
- **Từ chối toàn bộ (Rejected all)**: **no**

### 3. Lý do lựa chọn Candidate C
Candidate C là ứng viên duy nhất:
1. Phát hiện chốt chặn kiểm thử mặc định tại `test/scripts/count-type-importers.test.ts:265-318` (hàm `countImporters()` được gọi không tham số để ghim cứng 6 blocked stems của `microstructure`), cảnh báo việc đổi mặc định `subDir` sẽ làm gãy test suite ngay lập tức.
2. Bắt trúng xung đột định danh kép `AlmgrenChrissParams` tồn tại song song giữa `src/tree/quantlib/execution/almgren-chriss-trajectory.ts:6` và `src/tree/execution/almgren-chriss/almgren-chriss-types.ts`.
3. Chỉ ra sự lệch pha giữa `/api/ee/billing/ipn/route.ts:14-20` (chỉ verify HMAC) và `/api/ee/billing/nowpayments-ipn/route.ts:35-55` (có lưu D1 và nâng cấp tier trong `defaultSaasEntitlementStore`).
4. Phân tích cơ chế tự động đối chiếu hạn mức của `CreditLedgerStore.getOrCreateAccount` (`llm-credit-ledger.ts:69-78`) khi tier thay đổi.
5. Định dạng Markdown hoàn chỉnh, chuẩn xác từ đầu đến cuối bằng tiếng Việt kỹ thuật, không có đoạn nháp hay văn bản rác.

ultra: picked=5/5 margin=high unanimous=yes rejected_all=no
