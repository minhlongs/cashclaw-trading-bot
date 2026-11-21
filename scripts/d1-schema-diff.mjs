#!/usr/bin/env node
/**
 * Deterministic Canonical D1 Schema Snapshot, Diff, and Fail-Closed Lineage Preflight Tool.
 *
 * Usage:
 *   node scripts/d1-schema-diff.mjs snapshot <migrations-dir>
 *   node scripts/d1-schema-diff.mjs diff <dirA> <dirB>
 *   node scripts/d1-schema-diff.mjs preflight <sqlite-db-path>
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

function quoteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

const PR35_MARKER_TABLES = new Set([
  'ops_action_attempts',
  'ops_approval_events',
  'saas_alert_dispatch_log',
  'saas_bot_create_reservations',
  'saas_bot_tick_leases',
  'saas_entitlement_recovery_audit',
  'saas_nowpayments_ipn_event_history',
  'saas_payment_orders',
  'saas_workspace_memberships',
  'saas_workspaces',
]);

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function listSqlMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

export function extractSchemaSnapshot(db, migrationMeta = []) {
  const tables = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    )
    .all();

  const tableDetails = {};
  for (const t of tables) {
    const name = String(t.name);
    const qName = quoteIdent(name);
    const columns = db
      .prepare(`PRAGMA table_info(${qName})`)
      .all()
      .map((c) => ({
        cid: Number(c.cid),
        name: String(c.name),
        type: String(c.type),
        notnull: Number(c.notnull) === 1,
        defaultValue: c.dflt_value === null ? null : String(c.dflt_value),
        pk: Number(c.pk),
      }));

    const foreignKeys = db
      .prepare(`PRAGMA foreign_key_list(${qName})`)
      .all()
      .map((fk) => ({
        id: Number(fk.id),
        seq: Number(fk.seq),
        table: String(fk.table),
        from: String(fk.from),
        to: String(fk.to),
        onUpdate: String(fk.on_update),
        onDelete: String(fk.on_delete),
      }));

    const indexes = db
      .prepare(`PRAGMA index_list(${qName})`)
      .all()
      .map((idx) => {
        const idxName = String(idx.name);
        const cols = db
          .prepare(`PRAGMA index_info(${quoteIdent(idxName)})`)
          .all()
          .map((ic) => String(ic.name));
        return {
          name: idxName,
          unique: Number(idx.unique) === 1,
          origin: String(idx.origin),
          partial: Number(idx.partial) === 1,
          columns: cols,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    tableDetails[name] = {
      sql: String(t.sql ?? ''),
      columns,
      foreignKeys,
      indexes,
    };
  }

  const triggers = db
    .prepare(
      `SELECT name, tbl_name, sql FROM sqlite_master
       WHERE type = 'trigger' ORDER BY name ASC`,
    )
    .all()
    .map((r) => ({ name: String(r.name), table: String(r.tbl_name), sql: String(r.sql ?? '') }));

  const views = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'view' ORDER BY name ASC`,
    )
    .all()
    .map((r) => ({ name: String(r.name), sql: String(r.sql ?? '') }));

  const snapshot = {
    migrations: migrationMeta,
    tables: tableDetails,
    triggers,
    views,
  };
  return {
    ...snapshot,
    schemaSha256: sha256(JSON.stringify(snapshot)),
  };
}

export function buildSnapshotFromMigrationsDir(dir) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const files = listSqlMigrations(dir);
  const meta = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    db.exec(sql);
    meta.push({ filename: file, sha256: sha256(sql) });
  }
  const snap = extractSchemaSnapshot(db, meta);
  db.close();
  return snap;
}

export function diffSchemaSnapshots(snapA, snapB) {
  const tablesA = new Set(Object.keys(snapA.tables));
  const tablesB = new Set(Object.keys(snapB.tables));

  const onlyInA = [...tablesA].filter((t) => !tablesB.has(t)).sort();
  const onlyInB = [...tablesB].filter((t) => !tablesA.has(t)).sort();
  const shared = [...tablesA].filter((t) => tablesB.has(t)).sort();

  const tableDiffs = {};
  for (const t of shared) {
    const a = snapA.tables[t];
    const b = snapB.tables[t];
    const colsA = new Map(a.columns.map((c) => [c.name, c]));
    const colsB = new Map(b.columns.map((c) => [c.name, c]));
    const colsOnlyInA = [...colsA.keys()].filter((c) => !colsB.has(c)).sort();
    const colsOnlyInB = [...colsB.keys()].filter((c) => !colsA.has(c)).sort();
    const idxA = new Set(a.indexes.map((i) => i.name));
    const idxB = new Set(b.indexes.map((i) => i.name));
    const idxOnlyInA = [...idxA].filter((i) => !idxB.has(i)).sort();
    const idxOnlyInB = [...idxB].filter((i) => !idxA.has(i)).sort();
    const sqlChanged = a.sql !== b.sql;

    if (colsOnlyInA.length || colsOnlyInB.length || idxOnlyInA.length || idxOnlyInB.length || sqlChanged) {
      tableDiffs[t] = {
        columnsOnlyInA: colsOnlyInA,
        columnsOnlyInB: colsOnlyInB,
        indexesOnlyInA: idxOnlyInA,
        indexesOnlyInB: idxOnlyInB,
        ddlChanged: sqlChanged,
      };
    }
  }

  const intraDirCollisions = { lineageA: [], lineageB: [] };
  const indexMigrations = (list, target) => {
    const map = new Map();
    for (const m of list) {
      const prefix = m.filename.slice(0, 4);
      if (map.has(prefix)) target.push({ prefix, first: map.get(prefix), duplicate: m });
      else map.set(prefix, m);
    }
    return map;
  };
  const migA = indexMigrations(snapA.migrations, intraDirCollisions.lineageA);
  const migB = indexMigrations(snapB.migrations, intraDirCollisions.lineageB);
  const numericCollisions = [];
  for (const [prefix, mA] of migA.entries()) {
    const mB = migB.get(prefix);
    if (mB && (mA.filename !== mB.filename || mA.sha256 !== mB.sha256)) {
      numericCollisions.push({
        prefix,
        lineageA: mA,
        lineageB: mB,
      });
    }
  }

  return {
    schemaSha256A: snapA.schemaSha256,
    schemaSha256B: snapB.schemaSha256,
    numericCollisions,
    intraDirCollisions,
    tablesOnlyInA: onlyInA,
    tablesOnlyInB: onlyInB,
    sharedTableDiffs: tableDiffs,
    criticalHighlights: {
      botsWorkspaceIdInA: Boolean(snapA.tables.bots?.columns.some((c) => c.name === 'workspace_id')),
      botsWorkspaceIdInB: Boolean(snapB.tables.bots?.columns.some((c) => c.name === 'workspace_id')),
      h3MakerInA: Boolean(snapA.tables.bots?.sql.toLowerCase().includes('h3_maker')),
      h3MakerInB: Boolean(snapB.tables.bots?.sql.toLowerCase().includes('h3_maker')),
      paperLedgerPositionsInA: Boolean(snapA.tables.paper_ledger_positions),
      paperLedgerPositionsInB: Boolean(snapB.tables.paper_ledger_positions),
    },
  };
}

export function preflightDatabaseForMainMigrations(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const snap = extractSchemaSnapshot(db);
    const hasBotsWorkspaceId = Boolean(snap.tables.bots?.columns.some((c) => c.name === 'workspace_id'));
    const hasH3Maker = Boolean(snap.tables.bots?.sql.toLowerCase().includes('h3_maker'));
    const pr35TablesFound = Object.keys(snap.tables).filter((t) => PR35_MARKER_TABLES.has(t));

    let appliedMigrations = [];
    if (snap.tables.d1_migrations) {
      appliedMigrations = db
        .prepare('SELECT name FROM d1_migrations ORDER BY id ASC')
        .all()
        .map((r) => String(r.name));
    }

    const applied0018Main = appliedMigrations.includes('0018_add_h3_maker_strategy.sql');
    const blockers = [];

    if (hasBotsWorkspaceId && !applied0018Main) {
      blockers.push(
        'LINEAGE_COLLISION_P0: Target database has bots.workspace_id (PR #35 lineage) and has not applied 0018_add_h3_maker_strategy.sql. Applying main 0018 would recreate bots via bots_dg_tmp and silently drop workspace_id and idx_bots_workspace_status.',
      );
    }
    if (pr35TablesFound.length > 0) {
      blockers.push(
        `LINEAGE_COLLISION_P0: Target database contains PR #35-lineage tables (${pr35TablesFound.join(', ')}). Refusing automatic main migration apply.`,
      );
    }

    return {
      safeToApplyMainMigrations: blockers.length === 0,
      hasBotsWorkspaceId,
      hasH3Maker,
      pr35TablesFound,
      appliedMigrations,
      schemaSha256: snap.schemaSha256,
      blockers,
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , cmd, arg1, arg2] = process.argv;
  if (cmd === 'snapshot' && arg1) {
    process.stdout.write(`${JSON.stringify(buildSnapshotFromMigrationsDir(arg1), null, 2)}\n`);
  } else if (cmd === 'diff' && arg1 && arg2) {
    const snapA = buildSnapshotFromMigrationsDir(arg1);
    const snapB = buildSnapshotFromMigrationsDir(arg2);
    process.stdout.write(`${JSON.stringify(diffSchemaSnapshots(snapA, snapB), null, 2)}\n`);
  } else if (cmd === 'preflight' && arg1) {
    const res = preflightDatabaseForMainMigrations(arg1);
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    process.exit(res.safeToApplyMainMigrations ? 0 : 2);
  } else {
    process.stderr.write('Usage: node scripts/d1-schema-diff.mjs <snapshot|diff|preflight> <arg1> [arg2]\n');
    process.exit(1);
  }
}
