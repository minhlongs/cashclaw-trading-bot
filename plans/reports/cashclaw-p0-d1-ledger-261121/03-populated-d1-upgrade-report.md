# 03 — Populated D1 Upgrade Report (Fixtures A–E)

All fixtures were executed against isolated local state in `tests/recovery/d1_migration_lineage_and_populated_d1.test.ts` (3/3 tests passing).

## Fixture Matrix

| Fixture | Scope | Engine | Result | Key Assertions Verified |
|---|---|---|---|---|
| **Fixture A — Fresh Install** | Empty D1 → apply `0001`–`0019` → idempotent re-apply | Actual local Wrangler D1 (`wrangler d1 migrations apply --local`) | **PASS** | 19/19 migrations recorded in `d1_migrations`; re-apply is a clean no-op; `PRAGMA foreign_key_check` = `[]`; `preflightDatabaseForMainMigrations` = `safeToApplyMainMigrations: true` |
| **Fixture B — Populated Main** | Apply `0001`–`0017` → seed multi-tenant users, `bots`, `saas_workspace_members`, `paper_ledger_accounts`, `paper_order_intents`, `scheduler_bot_leases` → apply `0018`–`0019` | `node:sqlite` + canonical schema-diff | **PASS** | All pre-existing bot rows byte-identical before/after `0018`; `h3_maker` strategy insert succeeds post-`0018`; `paper_ledger_positions` created by `0019`; `PRAGMA foreign_key_check` = `[]`; `PRAGMA integrity_check` = `ok` |
| **Fixture C — Legacy Branch Compatibility (PR #35)** | Disposable DB with `0001`–`0014` + `bots.workspace_id` + `idx_bots_workspace_status` + `saas_workspaces` | `node:sqlite` + `scripts/d1-schema-diff.mjs` | **PASS (Fail-Closed)** | `preflightDatabaseForMainMigrations` refuses upgrade with exit code `2` and 2 `LINEAGE_COLLISION_P0` blockers; unguarded copy proves silent `workspace_id` loss despite clean `foreign_key_check` |
| **Fixture D — Adversarial Data** | Boundary micro-USD (`9007199254740000` near `Number.MAX_SAFE_INTEGER`), `PARTIALLY_FILLED` intents, active scheduler leases, multi-user isolation | `node:sqlite` (bundled with Fixture B) | **PASS** | Zero precision loss on boundary integers; `PARTIALLY_FILLED` qty (`50000000`) and ledger balances preserved identically; zero orphaned records or lost indexes |
| **Fixture E — Failure Recovery** | Mid-batch constraint violation (`invalid_strategy_enum` after `UPDATE paper_ledger_accounts`) on actual D1 | Actual local Wrangler D1 (`wrangler d1 execute --local --file`) | **PASS** | Command fails cleanly; preceding `UPDATE paper_ledger_accounts` is rolled back atomically; post-failure ledger SHA-256 matches pre-failure SHA-256 identically |

## Honest D1 Pragma Capability Classification

| Pragma | Actual Local Wrangler D1 Result | Classification | Supplemental Check |
|---|---|---|---|
| `PRAGMA foreign_key_check;` | Returns `[]` (0 violations) | **PASS** | Matches `node:sqlite` (`[]`) |
| `PRAGMA integrity_check;` | Fails with `SQLITE_AUTH: not authorized` | **UNSUPPORTED_IN_D1** | Verified via `node:sqlite` on persisted local D1 SQLite file: `[{ integrity_check: 'ok' }]` |
