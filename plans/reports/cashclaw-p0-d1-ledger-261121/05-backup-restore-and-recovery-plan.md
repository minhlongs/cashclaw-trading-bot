# 05 — Backup, Restore & Recovery Plan (With Non-Executed Production Proposal)

## 1. Local Synthetic Backup & Restore Drill Results

Executed on actual local Wrangler D1 (`cashclaw-db`, `--local --persist-to <tmpDir>`) in `tests/recovery/d1_migration_lineage_and_populated_d1.test.ts`:

| Drill Step | Mechanism | Verification | Result |
|---|---|---|---|
| **Baseline Snapshot** | Apply `0001`–`0019`, seed `bots` (`h3_maker`) + `paper_ledger_accounts`, record canonical `schemaSha256` & ledger row SHA-256 | `extractSchemaSnapshot` + `SELECT * FROM paper_ledger_accounts ORDER BY bot_id` | **PASS** |
| **WAL-Safe Backup** | `VACUUM INTO '<backup.sqlite>'` (avoids WAL-mode stale-page truncation observed with raw `copyFileSync`) | Clean standalone SQLite file created | **PASS** |
| **Mid-Migration Failure Rollback** | Multi-statement file: valid `UPDATE paper_ledger_accounts` followed by `CHECK` constraint violation (`invalid_strategy_enum`) | D1 rolls back the entire file atomically; post-failure ledger SHA-256 === pre-failure SHA-256 | **PASS** |
| **Destructive Mutation & Restore** | `DELETE FROM paper_ledger_accounts` → remove `-wal`/`-shm` sidecars → restore `<backup.sqlite>` | Post-restore ledger SHA-256 === pre-mutation SHA-256 identically | **PASS** |
| **Post-Restore Migration Idempotency** | Re-run `wrangler d1 migrations apply cashclaw-db --local` | 0 pending migrations applied; post-restore `schemaSha256` === pre-backup `schemaSha256` | **PASS** |

## 2. Recovery Mechanism Taxonomy

| Scenario | Primary Mechanism | When Required |
|---|---|---|
| Single batch / migration file aborts mid-statement | **Transactional Rollback** | Automatic in D1 `db.batch()` and `wrangler d1 execute --file` |
| Accidental destructive DML (`DELETE`/`DROP`) or bad applied migration | **Restore from Backup** | Cloudflare D1 Time Travel (`wrangler d1 time-travel restore`) or pre-change `wrangler d1 export` snapshot |
| Additive bug fix or new column/index on already-applied schema | **Forward Corrective Migration** | New `0020+` migration file; never rewrite historical applied migrations |
| Divergent lineage detected (e.g., PR #35 `bots.workspace_id` present) | **Manual Intervention (Fail-Closed)** | Halt automation on `d1-schema-diff.mjs preflight` exit code `2`; run owner-approved custom reconciliation |

## 3. Non-Executed Production Change Proposal (Requires Separate Owner Authorization Gate)

> **STATUS:** PROPOSAL ONLY — **NOT EXECUTED**. Remote D1 access and production deploys remain DENIED under Supreme Command #15.

### Separate Production Authorization Gate
Before any operator touches production D1 (`cashclaw-db` remote):
1. **Explicit Founder Sign-Off** naming the exact target D1 database ID, maintenance window, and commit SHA.
2. **Read-Only Remote Schema Inspection First:**
   - Run `wrangler d1 execute cashclaw-db --remote --command "SELECT name FROM d1_migrations ORDER BY id ASC;"` and export schema DDL.
   - Run `node scripts/d1-schema-diff.mjs preflight <exported-local-copy>` — **ABORT immediately** if exit code != `0` (e.g., if any PR #35 table or `bots.workspace_id` is detected).
3. **Pre-Change Backup & Time-Travel Bookmark:**
   - Capture `wrangler d1 time-travel info cashclaw-db` bookmark AND `wrangler d1 export cashclaw-db --remote --output pre-change-backup.sql`.
4. **Deployment Ordering (Code-Only Ledger Remediation):**
   - This PR introduces **zero new D1 migrations** (`0001`–`0019` unchanged).
   - Once production D1 is verified on `main` lineage `0001`–`0019`, deploy the updated Worker containing the atomic fencing guards.
5. **Post-Deploy Verification & Rollback Trigger:**
   - Verify `PRAGMA foreign_key_check` = `[]`, check Worker error logs for `STALE_FENCING_TOKEN_*`, and roll back via `npm run rollback:worker` if unexpected 5xx spikes occur.
