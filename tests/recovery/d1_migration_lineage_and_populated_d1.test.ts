import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildSnapshotFromMigrationsDir,
  diffSchemaSnapshots,
  extractSchemaSnapshot,
  preflightDatabaseForMainMigrations,
} from '../../scripts/d1-schema-diff.mjs';

interface SqlitePreparedStmtLike {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface SqliteDatabaseSyncLike {
  exec(sql: string): void;
  prepare(sql: string): SqlitePreparedStmtLike;
  close(): void;
}

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (location: string, opts?: { readOnly?: boolean }) => SqliteDatabaseSyncLike;
};

const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.resolve(REPO_ROOT, 'migrations');
const WRANGLER_BIN = path.resolve(REPO_ROOT, 'node_modules/.bin/wrangler');

function findPersistedD1SqliteFile(persistDir: string): string {
  const d1Dir = path.join(persistDir, 'v3/d1/miniflare-D1DatabaseObject');
  const files = fs.readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite'));
  if (files.length === 0) throw new Error(`No D1 sqlite file found under ${d1Dir}`);
  return path.join(d1Dir, files[0]!);
}

function runWranglerD1(args: string[]): string {
  return execFileSync(WRANGLER_BIN, ['d1', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('D1 Migration Lineage, Collision Proof, Populated Fixtures A-E & Backup/Restore', () => {
  it('enforces unique monotonic migration prefixes on main and detects PR #35-style bots.workspace_id collision fail-closed', () => {
    const mainFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const prefixes = mainFiles.map((f) => f.slice(0, 4));
    expect(new Set(prefixes).size).toBe(mainFiles.length);
    expect(mainFiles.length).toBeGreaterThanOrEqual(19);

    const mainSnap = buildSnapshotFromMigrationsDir(MIGRATIONS_DIR) as unknown as {
      tables: Record<string, { sql: string }>;
    };
    expect(mainSnap.tables.bots?.sql.toLowerCase()).toContain('h3_maker');
    expect(mainSnap.tables.paper_ledger_positions).toBeDefined();

    // Build disposable PR #35-shaped DB (0001..0014 + bots.workspace_id + idx_bots_workspace_status + PR #35 tables)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cashclaw-pr35-collision-'));
    try {
      const dbPath = path.join(tmpDir, 'pr35-disposable.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA foreign_keys = ON;');
      for (const f of mainFiles.filter((name) => Number(name.slice(0, 4)) <= 14)) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      }
      db.exec(`
        ALTER TABLE bots ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws_default';
        CREATE INDEX idx_bots_workspace_status ON bots(workspace_id, status);
        CREATE TABLE saas_workspaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
        INSERT INTO saas_workspaces (id, owner_user_id) VALUES ('ws-alpha', 'user-a'), ('ws-beta', 'user-b');
        INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at, workspace_id)
        VALUES ('bot-a', 'user-a', 'Alpha Bot', 'grid', 'BTC/USDT', 'binance', 'stopped', '{}', 1000, 1000, 1000, 'ws-alpha'),
               ('bot-b', 'user-b', 'Beta Bot', 'mean_reversion', 'ETH/USDT', 'binance', 'stopped', '{}', 2000, 1000, 1000, 'ws-beta');
      `);
      const beforeRows = db.prepare('SELECT id, user_id, workspace_id FROM bots ORDER BY id ASC').all();
      const beforeCols = (db.prepare('PRAGMA table_info(bots)').all() as Array<{ name: string }>).map((c) => c.name);
      const beforeIdx = (db.prepare('PRAGMA index_list(bots)').all() as Array<{ name: string }>).map((i) => i.name);
      db.close();

      expect(beforeCols).toContain('workspace_id');
      expect(beforeIdx).toContain('idx_bots_workspace_status');
      expect(beforeRows).toEqual([
        { id: 'bot-a', user_id: 'user-a', workspace_id: 'ws-alpha' },
        { id: 'bot-b', user_id: 'user-b', workspace_id: 'ws-beta' },
      ]);

      // Preflight MUST fail closed BEFORE applying main's 0018
      const preflight = preflightDatabaseForMainMigrations(dbPath);
      expect(preflight.safeToApplyMainMigrations).toBe(false);
      expect(preflight.hasBotsWorkspaceId).toBe(true);
      expect(preflight.pr35TablesFound).toContain('saas_workspaces');
      expect(preflight.blockers.length).toBeGreaterThanOrEqual(2);

      // Now prove on a disposable copy that unguarded 0018 silently drops workspace_id & its index
      // EVEN WHILE PRAGMA foreign_key_check reports 0 violations!
      const copyPath = path.join(tmpDir, 'pr35-after-0018.sqlite');
      fs.copyFileSync(dbPath, copyPath);
      const copyDb = new DatabaseSync(copyPath);
      copyDb.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0018_add_h3_maker_strategy.sql'), 'utf8'));
      const afterCols = (copyDb.prepare('PRAGMA table_info(bots)').all() as Array<{ name: string }>).map((c) => c.name);
      const afterIdx = (copyDb.prepare('PRAGMA index_list(bots)').all() as Array<{ name: string }>).map((i) => i.name);
      const fkViolations = copyDb.prepare('PRAGMA foreign_key_check').all();
      copyDb.close();

      expect(afterCols).not.toContain('workspace_id');
      expect(afterIdx).not.toContain('idx_bots_workspace_status');
      expect(fkViolations).toEqual([]); // P0: tenant ownership lost despite clean foreign_key_check
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Fixture A & E + Phase 5: fresh actual local Wrangler D1 install, idempotency, D1 pragma capability check, backup/restore & mid-migration rollback', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cashclaw-fixture-ae-'));
    try {
      // Fixture A: Fresh install of all 19 migrations via actual Wrangler local D1
      runWranglerD1(['migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', tmpDir]);
      // Idempotent re-apply
      runWranglerD1(['migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', tmpDir]);

      // PRAGMA foreign_key_check MUST be clean on actual D1
      const fkOut = JSON.parse(
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', 'PRAGMA foreign_key_check;']),
      ) as Array<{ results: unknown[] }>;
      expect(fkOut[0]?.results).toEqual([]);

      // PRAGMA integrity_check is expected to return SQLITE_AUTH under D1 (UNSUPPORTED_IN_D1)
      let integrityAuthError = false;
      try {
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', 'PRAGMA integrity_check;']);
      } catch (e) {
        const errObj = e as { message?: string; stdout?: string; stderr?: string };
        const combined = `${errObj.message ?? ''}${errObj.stdout ?? ''}${errObj.stderr ?? ''}`;
        integrityAuthError = combined.includes('SQLITE_AUTH') || combined.includes('not authorized');
      }
      expect(integrityAuthError).toBe(true);

      // Supplemental node:sqlite integrity_check on the persisted local D1 file
      const sqliteFile = findPersistedD1SqliteFile(tmpDir);
      const localDb = new DatabaseSync(sqliteFile, { readOnly: true });
      const ic = localDb.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
      const beforeSnap = extractSchemaSnapshot(localDb);
      localDb.close();
      expect(ic).toEqual([{ integrity_check: 'ok' }]);

      // Preflight passes cleanly on main-lineage DB
      const preflight = preflightDatabaseForMainMigrations(sqliteFile);
      expect(preflight.safeToApplyMainMigrations).toBe(true);
      expect(preflight.appliedMigrations.length).toBe(19);

      // Phase 5 Backup & Restore Drill: seed ledger data -> backup (using SQLite VACUUM INTO for clean snapshot) -> mutate -> restore -> verify exact hashes
      const seedSql = path.join(tmpDir, 'seed.sql');
      fs.writeFileSync(
        seedSql,
        `INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at)
         VALUES ('bot-bk-1', 'user-1', 'H3 Maker Bot', 'h3_maker', 'BTC/USDT', 'binance', 'stopped', '{}', 10000, 1000, 1000);
         INSERT INTO paper_ledger_accounts (
           bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
           realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
           initial_capital_micro_usd, version, fencing_token, updated_at_ms
         ) VALUES ('bot-bk-1', 10000000000, 0, 0, 0, 0, 0, 10000000000, 1, 1, 1000);`,
      );
      runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', seedSql]);

      const backupPath = path.join(tmpDir, 'backup.sqlite');
      const snapDb = new DatabaseSync(sqliteFile);
      snapDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);
      snapDb.close();
      const beforeLedgerRows = JSON.parse(
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', 'SELECT * FROM paper_ledger_accounts ORDER BY bot_id;']),
      ) as Array<{ results: unknown[] }>;
      const beforeLedgerHash = sha256(JSON.stringify(beforeLedgerRows[0]?.results ?? []));

      // Fixture E: Mid-batch constraint violation rolls back completely on actual D1
      const badMigrationSql = path.join(tmpDir, 'bad-mid.sql');
      fs.writeFileSync(
        badMigrationSql,
        `UPDATE paper_ledger_accounts SET cash_micro_usd = 999 WHERE bot_id = 'bot-bk-1';
         INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at)
         VALUES ('bot-invalid', 'user-1', 'Bad', 'invalid_strategy_enum', 'BTC/USDT', 'binance', 'stopped', '{}', 1000, 1000, 1000);`,
      );
      let midFailed = false;
      try {
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', badMigrationSql]);
      } catch {
        midFailed = true;
      }
      expect(midFailed).toBe(true);

      const afterRollbackRows = JSON.parse(
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', 'SELECT * FROM paper_ledger_accounts ORDER BY bot_id;']),
      ) as Array<{ results: unknown[] }>;
      expect(sha256(JSON.stringify(afterRollbackRows[0]?.results ?? []))).toBe(beforeLedgerHash);

      // Simulate destructive mutation + restore from backup
      runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', "DELETE FROM paper_ledger_accounts WHERE bot_id = 'bot-bk-1';"]);
      for (const sidecar of [`${sqliteFile}-wal`, `${sqliteFile}-shm`]) {
        if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
      }
      fs.copyFileSync(backupPath, sqliteFile);
      const afterRestoreRows = JSON.parse(
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--command', 'SELECT * FROM paper_ledger_accounts ORDER BY bot_id;']),
      ) as Array<{ results: unknown[] }>;
      expect(sha256(JSON.stringify(afterRestoreRows[0]?.results ?? []))).toBe(beforeLedgerHash);

      // Verify schema hash unchanged & migration reapplication stays idempotent after restore
      runWranglerD1(['migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', tmpDir]);
      const restoredDb = new DatabaseSync(sqliteFile, { readOnly: true });
      const afterSnap = extractSchemaSnapshot(restoredDb);
      restoredDb.close();
      expect(afterSnap.schemaSha256).toBe(beforeSnap.schemaSha256);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 90_000);

  it('Fixture B & D: populated main upgrade (0001..0017 -> seed -> 0018..0019) preserves all tenant bots, ledger, leases, intents, and adversarial FK/boundary data', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cashclaw-fixture-bd-'));
    try {
      const dbPath = path.join(tmpDir, 'populated-main.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA foreign_keys = ON;');
      const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      for (const f of allFiles.filter((n) => Number(n.slice(0, 4)) <= 17)) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      }

      // Seed Populated Main + Adversarial Data (multi-user, strategies, intents, ledger, leases, boundary micro-USD)
      db.exec(`
        INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at)
        VALUES ('bot-1', 'user-1', 'Grid One', 'grid', 'BTC/USDT', 'binance', 'paper_test', '{"grids":10}', 5000, 1000, 1000),
               ('bot-2', 'user-2', 'Vol DCA', 'volatility_dca', 'ETH/USDT', 'binance', 'stopped', '{"step":5}', 2500, 1000, 1000);
        INSERT INTO saas_workspace_members (workspace_id, user_id, role, created_at_ms)
        VALUES ('ws-1', 'user-1', 'OWNER', 1000), ('ws-2', 'user-2', 'OWNER', 1000);
        INSERT INTO paper_ledger_accounts (
          bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
          realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
          initial_capital_micro_usd, version, fencing_token, updated_at_ms
        ) VALUES ('bot-1', 9007199254740000, 0, 0, 0, 0, 0, 9007199254740000, 1, 3, 1000);
        INSERT INTO paper_order_intents (
          bot_id, client_order_id, symbol, side, order_type, quantity_base,
          filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
          reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
        ) VALUES ('bot-1', 'ord-adv-1', 'BTCUSDT', 'buy', 'limit', 100000000, 50000000, 50000000000, 2500000000, 0, 'PARTIALLY_FILLED', 3, 1000, 1001);
        INSERT INTO scheduler_bot_leases (bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms)
        VALUES ('bot-1', 'ws-1', 'iso-1', 3, 1000, 9999999999);
      `);
      const beforeSnap = extractSchemaSnapshot(db);
      const beforeBotRows = db.prepare('SELECT id, user_id, name, strategy, pair, exchange, status, config_json FROM bots ORDER BY id ASC').all();

      // Apply 0018 and 0019 over populated state
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0018_add_h3_maker_strategy.sql'), 'utf8'));
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0019_paper_ledger_positions.sql'), 'utf8'));

      const afterBotRows = db.prepare('SELECT id, user_id, name, strategy, pair, exchange, status, config_json FROM bots ORDER BY id ASC').all();
      const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
      const ic = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
      const afterSnap = extractSchemaSnapshot(db);

      // Verify H3_MAKER insert now succeeds and existing populated data is 100% intact
      db.exec(`
        INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at)
        VALUES ('bot-3', 'user-1', 'H3 Maker', 'h3_maker', 'BTC/USDT', 'binance', 'stopped', '{}', 1000, 1000, 1000);
      `);
      const ledgerRow = db.prepare("SELECT cash_micro_usd, version FROM paper_ledger_accounts WHERE bot_id = 'bot-1'").get() as {
        cash_micro_usd: number;
        version: number;
      };
      const intentRow = db.prepare("SELECT lifecycle_state, filled_qty_base FROM paper_order_intents WHERE client_order_id = 'ord-adv-1'").get() as {
        lifecycle_state: string;
        filled_qty_base: number;
      };
      db.close();

      expect(afterBotRows).toEqual(beforeBotRows);
      expect(fkViolations).toEqual([]);
      expect(ic).toEqual([{ integrity_check: 'ok' }]);
      expect(ledgerRow).toEqual({ cash_micro_usd: 9007199254740000, version: 1 });
      expect(intentRow).toEqual({ lifecycle_state: 'PARTIALLY_FILLED', filled_qty_base: 50000000 });

      const diff = diffSchemaSnapshots(beforeSnap, afterSnap) as unknown as {
        tablesOnlyInB: string[];
        sharedTableDiffs: Record<string, { columnsOnlyInA: string[]; columnsOnlyInB: string[] }>;
        criticalHighlights: { h3MakerInA: boolean; h3MakerInB: boolean };
      };
      expect(diff.tablesOnlyInB).toEqual(['paper_ledger_positions']);
      expect(diff.sharedTableDiffs.bots?.columnsOnlyInA).toEqual([]);
      expect(diff.sharedTableDiffs.bots?.columnsOnlyInB).toEqual([]);
      expect(diff.criticalHighlights.h3MakerInA).toBe(false);
      expect(diff.criticalHighlights.h3MakerInB).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
