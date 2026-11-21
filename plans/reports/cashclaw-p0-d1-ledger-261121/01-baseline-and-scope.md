# 01 — Baseline, Scope & Forensic Validation

- **Execution ID:** CASHCLAW SUPREME COMMAND #15 (`P0 DATABASE INTEGRITY RECOVERY & VERIFIED SHIP`)
- **Date:** 2026-11-21 (Asia/Saigon)
- **Worktree:** `/Users/macbook/orca/workspaces/trade-bot/hawksbill`
- **Feature Branch:** `fix/cashclaw-d1-ledger-integrity`
- **Baseline Commit:** `ac2921a7922007566a2f71cb6d76a087790b8ae1` (`fix(security): harden identity provenance and close P1-01 backtest bypass (#68)`)
- **Preserved Untracked Artifacts:** `plans/reports/quant-roadmap-261121/gate-matrix.json` (untouched and excluded from commits)

## 1. Safety & Authorization Boundaries Verified

All DENIED boundaries remained strictly enforced throughout execution:
- No push to `main`, no PR merge, no production Worker deploy, no remote D1 access, no remote migration apply.
- No modification to Draft PR #35 or historical `migrations/0018_add_h3_maker_strategy.sql`.
- No modification to real tenant/billing/credit records, G13 live cache, or G13 checkpoint genesis (`2026-11-14T13:07:31.631351Z`).
- `liveTradingUnlocked === false` (G15 remains locked); zero live exchange orders; zero paid services introduced; zero synthetic market data fabricated.

## 2. Reproduction of #14 Forensic Claims (`Claim → Source → Reproduction → Expected → Actual → Severity`)

| # | Claim | Source | Reproduction | Expected | Actual | Severity |
|---|---|---|---|---|---|---|
| 1 | Five migration-number collisions (`0015`–`0019`) between `main` and Draft PR #35 | #14 forensic report & `gh pr view 35 --json files` | `node scripts/d1-schema-diff.mjs diff migrations /tmp/cashclaw-p0-d1-261121/lineage-b-full` | Unique, non-colliding migration prefixes | Confirmed 5 numeric collisions (`0015`–`0019`) with completely distinct filenames, SHA-256 digests, and table sets | **P0** |
| 2 | `bots.workspace_id` silently dropped when `main`'s `0018_add_h3_maker_strategy.sql` runs on a PR #35-shaped DB | `migrations/0018_add_h3_maker_strategy.sql` | Disposable SQLite fixture with `bots.workspace_id` + `idx_bots_workspace_status` (`tests/recovery/d1_migration_lineage_and_populated_d1.test.ts`) | Fail-closed refusal or preservation of `workspace_id` and its index | Confirmed: `0018` rebuilds `bots` via `bots_dg_tmp` and silently drops `workspace_id` and `idx_bots_workspace_status` while `PRAGMA foreign_key_check` returns `[]` | **P0** |
| 3 | `paper_order_intents` upsert silently skips stale fencing tokens without aborting the D1 batch | `src/tree/ledger/d1-ledger-sql.ts`, `d1-atomic-batch-builder.ts` | Failing-first regression test in `tests/recovery/d1_atomic_ledger_actual_d1.test.ts` | Entire batch aborts and rolls back when `WHERE excluded.fencing_token >= paper_order_intents.fencing_token` matches 0 rows | Confirmed on baseline: `changes() = 0` did not throw, allowing partial/stale batch execution. **Fixed** with `ASSERT_ORDER_UPSERT_APPLIED_SQL` (`WHERE changes() = 0`) | **P0** |
| 4 | `DELETE_BOT_POSITIONS_GUARDED_SQL` lacked fencing guard & `buildPositionBatchStatements` lacked upfront stale-fencing abort | `src/tree/ledger/d1-positions-sql.ts` | Failing-first regression tests in `tests/recovery/d1_atomic_ledger_actual_d1.test.ts` | Stale worker cannot delete or overwrite positions owned by a newer fencing token | Confirmed on baseline: stale worker deleted active positions owned by higher token. **Fixed** with `ASSERT_POSITION_FENCING_SQL` + `AND fencing_token <= ?2` | **P0** |
| 5 | `positionsTableCache` permanently cached `false` on transient D1 query errors | `src/tree/ledger/d1-positions-sql.ts` | Failing-first regression test with transient error followed by recovery | Next call re-probes `sqlite_master` and persists positions once D1 recovers | Confirmed on baseline: `WeakMap<D1DatabaseLike, boolean>` cached `false` forever. **Fixed** by changing cache to `WeakMap<D1DatabaseLike, true>` | **P1** |
| 6 | Actual local Wrangler D1 `changes()` cross-statement behavior & rollback unverified | #14 forensic report | Actual Wrangler D1 execution (`./node_modules/.bin/wrangler d1 execute cashclaw-db --local`) in `tests/recovery/d1_atomic_ledger_actual_d1.test.ts` | Prove whether `changes()` persists across statements in a D1 batch and rolls back prior writes on abort | Verified on actual local Wrangler D1: `INSERT ... ON CONFLICT DO UPDATE` reports `changes() = 1` when applied and `0` when fenced out; trailing `WHERE changes() = 0` `NOT NULL` abort rolls back the entire batch atomically | **P0 (Verified)** |
| 7 | Missing populated upgrade & backup/restore evidence (Fixtures A–E) | #14 forensic report | `tests/recovery/d1_migration_lineage_and_populated_d1.test.ts` | Verified populated upgrades, adversarial FK/boundary data, WAL-safe backup/restore, and D1 pragma honesty | Verified across Fixtures A–E on actual Wrangler D1 + `node:sqlite`; `PRAGMA integrity_check` returns `SQLITE_AUTH` on D1 (`UNSUPPORTED_IN_D1`), supplemented by `node:sqlite` `integrity_check = ok` | **P0 (Verified)** |
