# 04 — Actual D1 Atomic Ledger Remediation & Independent Oracle Report

## 1. Root-Cause Defects Found & Remediated

1. **P0 — Silent Stale-Fencing No-Op on `paper_order_intents` (`src/tree/ledger/d1-ledger-sql.ts`, `d1-atomic-batch-builder.ts`):**
   - `UPSERT_ORDER_INTENT_SQL` used `ON CONFLICT DO UPDATE ... WHERE excluded.fencing_token >= paper_order_intents.fencing_token`. When a stale worker collided with a higher token, SQLite silently updated 0 rows without throwing, permitting subsequent statements in `db.batch()` to commit.
   - **Fix:** Added `ASSERT_ORDER_UPSERT_APPLIED_SQL` (`INSERT INTO paper_order_intents (...) SELECT NULL... WHERE changes() = 0`) immediately after each order upsert in `buildGroupCommitPlan`, and added `STALE_FENCING_TOKEN_ON_INTENT` classification in `classifyBatchError`.
2. **P0 — Unguarded Position Delete & Missing Upfront Position Fencing Abort (`src/tree/ledger/d1-positions-sql.ts`, `d1-atomic-batch-builder.ts`):**
   - `DELETE_BOT_POSITIONS_GUARDED_SQL` lacked `AND fencing_token <= ?2`, and `buildPositionBatchStatements` did not abort the batch when a newer fencing token existed in `scheduler_bot_leases` or `paper_ledger_positions`.
   - **Fix:** Added `ASSERT_POSITION_FENCING_SQL` as the first statement of `buildPositionBatchStatements`, added `AND fencing_token <= ?2` to `DELETE_BOT_POSITIONS_GUARDED_SQL`, and added `STALE_FENCING_TOKEN_ON_POSITION` classification in `classifyBatchError`.
3. **P1 — Permanent Negative Cache Poisoning on Transient D1 Errors (`src/tree/ledger/d1-positions-sql.ts`):**
   - `positionsTableCache` was `WeakMap<D1DatabaseLike, boolean>`, permanently caching `false` after a single transient D1 error and silently dropping all future position persistence for that isolate.
   - **Fix:** Changed cache to `WeakMap<D1DatabaseLike, true>` so only confirmed table presence is cached; missing-table or transient errors are re-checked on subsequent calls.

## 2. Actual Local Wrangler D1 `changes()` Proof

Executed in `tests/recovery/d1_atomic_ledger_actual_d1.test.ts` via `./node_modules/.bin/wrangler d1 execute cashclaw-db --local --persist-to <dir>`:
- **Fresh token (`fencing_token = 5`):** `INSERT ... ON CONFLICT DO UPDATE` updates the row (`changes() = 1`), `ASSERT_ORDER_UPSERT_APPLIED_SQL` matches 0 rows (`WHERE changes() = 0` is false), and the batch commits cleanly (`filled_qty_base = 100000000`, `lifecycle_state = 'FILLED'`).
- **Stale token (`fencing_token = 4 < 5`) in a multi-statement batch:** Preceding `UPDATE paper_ledger_accounts SET cash_micro_usd = 1` executes, `UPSERT_ORDER_INTENT_SQL` matches 0 rows (`changes() = 0`), `ASSERT_ORDER_UPSERT_APPLIED_SQL` fires `NOT NULL constraint failed: paper_order_intents.bot_id`, and **Wrangler D1 atomically rolls back the entire batch** (`cash_micro_usd` remains `10000000000`, `paper_order_intents` remains unchanged at `fencing_token = 5`).

## 3. 18-Case Fault-Injection Matrix (`tests/recovery/d1_atomic_ledger_fault_matrix.test.ts`)

All 18 scenarios verified passing (5 grouped test suites, 18 assertions):
1. Duplicate intent (idempotency hash dedup) — **PASS**
2. Duplicate fill — **PASS**
3. Out-of-order fill — **PASS**
4. Partial fill — **PASS**
5. Cancel after partial fill (margin release) — **PASS**
6. Reduce-only closure — **PASS**
7. Zero-entry reduce-only rejection — **PASS**
8. Stale fencing token — **PASS**
9. Lost lease — **PASS**
10. Database busy/failure — **PASS**
11. Worker crash before batch — **PASS**
12. Failure inside batch (atomic rollback) — **PASS**
13. Worker crash after commit — **PASS**
14. Acknowledgement loss — **PASS**
15. Retry after restart (idempotent replay) — **PASS**
16. Concurrent workers on same bot (optimistic version/fencing race) — **PASS**
17. Cross-tenant intent injection (bot-scoped isolation) — **PASS**
18. Cold-restart reconciliation after recovery — **PASS**

## 4. Independent Python `Decimal` Accounting Oracle (`scripts/verify_ledger_oracle.py`)

- Implemented independently in Python 3 using `decimal.Decimal` (`getcontext().prec = 50`), with zero imports from TypeScript ledger code.
- Replays raw event history (`ORDER_SUBMIT`, `FILL`, `FEE`, `FUNDING`, `ORDER_CANCEL`) and reconciles every account row in `paper_ledger_accounts` and every debit/credit pair in `paper_journal_entries`.
- Enforces the exact accounting identity `Assets - Liabilities - Equity = 0` (`cash + margin_reserved + position_margin == initial_capital + realized_pnl - fees_expense + funding_net`) with **0 micro-USD tolerance**.
- Verified in `tests/recovery/d1_atomic_ledger_actual_d1.test.ts` on both valid multi-fill lifecycles (`ok: true`, `mismatches: []`) and intentionally corrupted tampered snapshots (detected exact mismatch amount and event/account ID, non-zero exit).
