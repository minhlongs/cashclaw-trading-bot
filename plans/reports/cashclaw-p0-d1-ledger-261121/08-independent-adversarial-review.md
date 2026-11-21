# 08 — Independent Adversarial Security & Integrity Review

An isolated `code-reviewer` subagent audited the complete uncommitted diff against baseline `ac2921a` (`src/tree/ledger/d1-ledger-sql.ts`, `d1-positions-sql.ts`, `d1-atomic-batch-builder.ts`, `tests/risk/g7_live_bot_wiring.test.ts`, `scripts/d1-schema-diff.mjs`, `scripts/verify_ledger_oracle.py`, and all three new test suites under `tests/recovery/`).

## Findings & Verified Resolutions

| Severity | Finding | Location | Resolution Applied & Verified |
|---|---|---|---|
| **P0** | None | — | 0 P0 findings. Primary atomic rollback guards (`ASSERT_ORDER_UPSERT_APPLIED_SQL`, `ASSERT_POSITION_FENCING_SQL`, `DELETE_BOT_POSITIONS_GUARDED_SQL`) and PR #35 preflight verified sound. |
| **P1-1** | Silent ledger/position desync on transient D1 error (`catch`-and-swallow in `hasPositionsTableInDb`) + empty position-only batch | `src/tree/ledger/d1-positions-sql.ts:98-108`, `d1-atomic-batch-builder.ts:161-168` | **FIXED:** Removed `catch`-and-swallow in `hasPositionsTableInDb`; `buildGroupCommitPlan` now catches probe errors fail-closed (`POSITIONS_TABLE_PROBE_FAILED`) and rejects empty position-only commits (`POSITIONS_TABLE_UNAVAILABLE`). Verified with injected `SQLITE_BUSY` regression test. |
| **P1-2** | Over-broad error matching in `classifyBatchError` (missing `NOT NULL` check on sentinel columns; over-broad `CHECK constraint` match) | `src/tree/ledger/d1-atomic-batch-builder.ts:25-40` | **FIXED:** Required `msg.includes('NOT NULL')` for all three sentinel-NULL abort guards and scoped `CHECK constraint` matching to `cash_micro_usd` / `paper_ledger_accounts`. |
| **P2-3** | Fencing-token bypass on new intents or empty positions when `scheduler_bot_leases` has no row | `src/tree/ledger/d1-ledger-sql.ts:130-133`, `d1-positions-sql.ts:18-22` | **FIXED:** Added `paper_ledger_accounts.fencing_token > ?` checks to both `UPSERT_ORDER_STATE_SQL` and `ASSERT_POSITION_FENCING_SQL`. |
| **P2-4** | Unescaped SQLite identifier interpolation in PRAGMAs, intra-directory prefix overwrite, and `file://` URL comparison | `scripts/d1-schema-diff.mjs` | **FIXED:** Added `quoteIdent()` escaping `"` → `""`, intra-directory duplicate prefix detection (`intraDirCollisions`), and `pathToFileURL(path.resolve(process.argv[1])).href`. |
| **P2-5** | Python oracle validation gaps (invalid direction, non-integer micro-USD, negative unsigned amounts, silent skip on empty `observed_journal_legs`) | `scripts/verify_ledger_oracle.py` | **FIXED:** Added strict `parse_int_micro_usd()` (exact integer + sign bounds), explicit `direction in ("DEBIT", "CREDIT")` validation, and mandatory journal reconciliation when events are present. |
| **P2-6** | Transient probe error path not directly exercised in test | `tests/recovery/d1_atomic_ledger_actual_d1.test.ts:230-237` | **FIXED:** Added explicit transient `SQLITE_BUSY` probe fault injection verifying fail-closed abort (`version === 0`) and clean recovery on retry (`version === 1`). |
| **NIT** | Standalone CLI script lengths slightly >200 LOC; Wrangler D1 parity test | `scripts/d1-schema-diff.mjs`, `scripts/verify_ledger_oracle.py`, `d1_atomic_ledger_actual_d1.test.ts` | Accepted as minor for standalone audit tooling; core `changes()` atomic rollback verified on actual Wrangler local D1. |

## Post-Fix Verification
- `npm run type-check`: **0 errors**
- `npm run lint`: **0 errors, 0 warnings**
- `npx knip`: **PASS**
- `npm test`: **761/761 files, 6,412/6,412 tests PASS** (including `post_merge_forensic_guards.test.ts` 16/16 and all 14 new recovery/oracle/lineage tests)
