# 06 — Application & OpenNext Worker Compatibility

## 1. Local OpenNext Worker Build & workerd + Local D1 Execution

- **Build command:** `npm run build:worker` (`npx @opennextjs/cloudflare build`, Next.js 16.3.1, OpenNext Cloudflare)
  - **Result:** **PASS** — Compiled `.open-next/worker.js` cleanly with 0 TypeScript or bundle errors.
- **Local workerd + Migrated Local D1 Smoke Test:**
  - Applied all 19 migrations via `wrangler d1 migrations apply cashclaw-db --local --persist-to /tmp/cashclaw-p0-d1-261121/worker-d1`.
  - Booted compiled OpenNext Worker via `wrangler dev --local --port 8789 --persist-to ...`:
    - `GET /` → `307 Temporary Redirect` (locale routing active)
    - `GET /api/bots` (unauthenticated) → `401 Unauthorized`
    - `POST /api/bots` (unauthenticated) → `401 Unauthorized`
    - `GET /api/backtests` (unauthenticated) → `404 Not Found`

## 2. PR #68 Security & Playwright E2E Verification

- **Command:** `npx playwright test` (Chromium, `tests/security/*.spec.ts`)
- **Result:** **7/7 PASSED** (`8.8s`):
  - `g11_tenant_e2e.spec.ts` (4/4): paper-only separation, VN HTTP 451 crypto checkout block, middleware `x-user-id` spoofing rejection (`401`) & cross-workspace anti-IDOR (`403`), `/api/ee/billing/nowpayments-ipn` `partially_paid` & 10x parallel replay defense.
  - `p1-01-backtest-bypass-e2e.spec.ts` (3/3): rejects `/public/backtests`, `/favicon.ico/backtests`, `/_next/staticX/backtests`, `/faviconXico` (`404`) despite forged `x-user-id`; strips forged `x-user-id` on `/api/bots`, `/vi/backtests`, and direct `Next-Action` POST probes; preserves `/en` locale context.

## 3. Application × Schema Compatibility Matrix (2×2)

This remediation modifies only Worker-side ledger SQL batch guards (`d1-ledger-sql.ts`, `d1-positions-sql.ts`, `d1-atomic-batch-builder.ts`) and adds **zero** schema changes beyond `0019_paper_ledger_positions.sql`.

| Application \ Schema | **Old Schema (`<= 0017`, pre-`0018`/`0019`)** | **New Schema (`0001`–`0019`, `main` canonical)** |
|---|---|---|
| **Old App (`ac2921a`)** | Compatible for pre-`h3_maker` bots; lacks `paper_ledger_positions` table and has P0 silent stale-fencing bugs on order intents & positions | Compatible at SQL level, but retains P0 silent stale-fencing & negative-cache bugs fixed in this PR |
| **New App (`fix/cashclaw-d1-ledger-integrity`)** | **Partially compatible (degraded):** `positionsTableCache` detects missing `paper_ledger_positions` without caching `false` permanently, and `h3_maker` bot inserts fail CHECK constraint until `0018` is applied. **Do not deploy before `0018`–`0019` are verified.** | **Fully Compatible (Recommended Target):** All 19 migrations present; atomic fencing guards (`ASSERT_ORDER_UPSERT_APPLIED_SQL`, `ASSERT_POSITION_FENCING_SQL`) and `h3_maker` strategy fully active |

### Required Deployment Ordering
1. Verify target D1 schema is on canonical `main` lineage `0001`–`0019` using `d1-schema-diff.mjs preflight` (fail-closed if PR #35 lineage is present).
2. If upgrading from `<= 0017` on `main` lineage, apply `0018` and `0019` **before** deploying the new Worker so `h3_maker` and `paper_ledger_positions` are available on first tick.
3. No zero-downtime claim is made for cross-lineage (PR #35 → `main`) databases; cross-lineage upgrades are explicitly **FAIL-CLOSED**.
