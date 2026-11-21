# 02 — Migration Lineage Reconstruction & Canonical Schema Diff

## 1. Lineage A (`main`) vs Lineage B (Draft PR #35) — 0015..0019 Collision Map

Canonical schema snapshots produced by `scripts/d1-schema-diff.mjs`:
- **Lineage A (`main` 0001–0019) Canonical Schema SHA-256:** `f3a827333a11e40b0592137b00da0ef7eefc596fcc4a352cd79003d928982d9b`
- **Lineage B (PR #35 0001–0014 + PR #35 0015–0019) Canonical Schema SHA-256:** `490052699c48ba937a43c772f06a2c7eae63ed9e5f7d4926fcbb58677d5e9e9c`

| Prefix | Lineage A (`main`) Filename & SHA-256 | Lineage B (Draft PR #35) Filename & SHA-256 |
|---|---|---|
| `0015` | `0015_saas_workspace_members.sql` (`b6af9afc...479b41`) | `0015_ops_work_item_concurrency.sql` (`88bf34b7...03b857`) |
| `0016` | `0016_saas_checkout_orders.sql` (`c397c2a9...6a678`) | `0016_workspace_authorization_quota_billing.sql` (`564c8b62...7822e`) |
| `0017` | `0017_paper_ledger_and_leases.sql` (`48c2487b...ca530`) | `0017_legacy_entitlement_recovery_audit.sql` (`d80562a5...1526`) |
| `0018` | `0018_add_h3_maker_strategy.sql` (`ce3f3fea...3948`) | `0018_ops_approval_durable_scheduling.sql` (`a7332bb3...7bd2a`) |
| `0019` | `0019_paper_ledger_positions.sql` (`10fab8b2...23708`) | `0019_ops_action_retry_policy.sql` (`064ae3c3...2790`) |

### Wrangler Tracking Identity
Wrangler D1 records applied migrations in `d1_migrations(id, name, applied_at)` keyed by **exact filename** (`name`), NOT solely by numeric prefix. Therefore, if a database already has PR #35's `0015`–`0019` applied, Wrangler considers `main`'s `0015_saas_workspace_members.sql` through `0019_paper_ledger_positions.sql` to be unapplied and will attempt to execute them directly over the PR #35 schema.

## 2. Structural Schema Diff Highlights

- **Tables only in Lineage A (`main`, 8 tables):**
  `paper_journal_entries`, `paper_ledger_accounts`, `paper_ledger_positions`, `paper_order_intents`, `processed_event_hashes`, `saas_checkout_orders`, `saas_workspace_members`, `scheduler_bot_leases`
- **Tables only in Lineage B (PR #35, 10 tables):**
  `ops_action_attempts`, `ops_approval_events`, `saas_alert_dispatch_log`, `saas_bot_create_reservations`, `saas_bot_tick_leases`, `saas_entitlement_recovery_audit`, `saas_nowpayments_ipn_event_history`, `saas_payment_orders`, `saas_workspace_memberships`, `saas_workspaces`
- **Critical shared-table divergence (`bots`):**
  - Lineage A (`main`): `strategy` CHECK constraint includes `'h3_maker'`; no `workspace_id` column.
  - Lineage B (PR #35): adds `bots.workspace_id TEXT NOT NULL DEFAULT 'ws_default'` and `idx_bots_workspace_status(workspace_id, status)`; does NOT include `'h3_maker'`.

## 3. Empirical Proof of the `0018` Collision (Disposable DB)

Executed in `tests/recovery/d1_migration_lineage_and_populated_d1.test.ts`:
1. Constructed a disposable PR #35-shaped SQLite database with `saas_workspaces` (`ws-alpha`, `ws-beta`) and two tenant bots (`bot-a → ws-alpha`, `bot-b → ws-beta`) plus `idx_bots_workspace_status`.
2. Ran `preflightDatabaseForMainMigrations(dbPath)` from `scripts/d1-schema-diff.mjs`:
   - Result: `safeToApplyMainMigrations: false`, `hasBotsWorkspaceId: true`, `pr35TablesFound: ['saas_workspaces']`, 2 `LINEAGE_COLLISION_P0` blockers (CLI exits with code `2`).
3. On a disposable copy, executed `migrations/0018_add_h3_maker_strategy.sql` unguarded:
   - **Before:** `bots` columns included `workspace_id`; indexes included `idx_bots_workspace_status`; rows mapped `bot-a → ws-alpha`, `bot-b → ws-beta`.
   - **After:** `workspace_id` and `idx_bots_workspace_status` were **completely dropped** by `bots_dg_tmp` rebuild, destroying tenant workspace ownership, **even though `PRAGMA foreign_key_check` returned `[]` (0 violations)**.

## 4. Selected Migration Strategy (Option A + Fail-Closed Preflight, PR #35 Deferred)

- **Decision:** Preserve `main`'s canonical lineage (`0001`–`0019`) untouched (do NOT rewrite immutable `0018_add_h3_maker_strategy.sql`), leave Draft PR #35 unmerged/deferred, and enforce `node scripts/d1-schema-diff.mjs preflight <db>` fail-closed before any future schema merge or production migration.
- Any future Operations/Workspace features from PR #35 MUST be reintroduced as new forward-only migrations (`0020+`) against `main`'s canonical schema.
