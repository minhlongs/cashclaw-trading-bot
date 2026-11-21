import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { preflightDatabaseForMainMigrations } from '../../scripts/d1-schema-diff.mjs';

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
const CLI_PATH = path.resolve(REPO_ROOT, 'scripts/d1-schema-diff.mjs');

const ALL_MAIN_MIGRATIONS = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));

interface PreflightResultLike {
  status?: string;
  safeToApplyMainMigrations: boolean;
  observedStage?: string;
  expectedStage?: string;
  blockers: string[];
  diagnostics?: Record<string, unknown>;
}

function createCanonicalPrefixDb(
  tmpDir: string,
  filename: string,
  count: number,
  opts: { recordMigrations?: boolean; customMigrationNames?: string[] } = {},
): string {
  const dbPath = path.join(tmpDir, filename);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  const recordMigrations = opts.recordMigrations ?? true;
  if (recordMigrations) {
    db.exec(`
      CREATE TABLE "d1_migrations"(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
  }
  const applied = ALL_MAIN_MIGRATIONS.slice(0, count);
  for (const file of applied) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  if (recordMigrations) {
    const names = opts.customMigrationNames ?? applied;
    const stmt = db.prepare('INSERT INTO d1_migrations (name) VALUES (?)');
    for (const name of names) {
      stmt.run(name);
    }
  }
  db.close();
  return dbPath;
}

function runPreflightCli(dbPath: string): { exitCode: number; payload: PreflightResultLike } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, 'preflight', dbPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, payload: JSON.parse(stdout) as PreflightResultLike };
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    return {
      exitCode: e.status ?? 1,
      payload: JSON.parse(e.stdout ?? '{}') as PreflightResultLike,
    };
  }
}

describe('P1 Fail-Closed D1 Migration Preflight Regression Matrix (Cases A-L)', () => {
  it('Case A — Unknown migration name in d1_migrations is blocked fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-a-'));
    try {
      const names = [...ALL_MAIN_MIGRATIONS.slice(0, 17), '9999_unregistered_hotfix.sql'];
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-a.sqlite', 17, { customMigrationNames: names });
      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_UNKNOWN_MIGRATION');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case B — Out-of-order / gapped migration history is blocked fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-b-'));
    try {
      // Skip 0016 (gap) while recording 0017
      const names = [...ALL_MAIN_MIGRATIONS.slice(0, 15), ALL_MAIN_MIGRATIONS[16]!];
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-b.sqlite', 17, { customMigrationNames: names });
      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_MIGRATION_ORDER');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case C — Numeric collision sharing ordinal 0015 with different filename is blocked fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-c-'));
    try {
      const names = [...ALL_MAIN_MIGRATIONS.slice(0, 14), '0015_pr35_workspaces_collision.sql'];
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-c.sqlite', 14, { customMigrationNames: names });
      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_LEGACY_LINEAGE_COLLISION');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case D — Extra non-workspace_id column on bots (legacy_owner_ref) is blocked before 0018 rebuild', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-d-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-d.sqlite', 17);
      const db = new DatabaseSync(dbPath);
      db.exec(`ALTER TABLE bots ADD COLUMN legacy_owner_ref TEXT NOT NULL DEFAULT 'legacy';`);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_DESTRUCTIVE_OBJECT_LOSS');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case E — Extra index on bots is blocked before 0018 rebuild', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-e-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-e.sqlite', 17);
      const db = new DatabaseSync(dbPath);
      db.exec(`CREATE INDEX idx_bots_custom_pair_status ON bots(pair, status);`);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_DESTRUCTIVE_OBJECT_LOSS');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case F — Modified same-named index (changed partial WHERE predicate / uniqueness) is blocked', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-f-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-f.sqlite', 19);
      const db = new DatabaseSync(dbPath);
      db.exec(`DROP INDEX idx_bots_status;`);
      db.exec(`CREATE INDEX idx_bots_status ON bots(status) WHERE status != 'stopped';`);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_SCHEMA_DRIFT');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case G — Trigger drift referencing bots is blocked fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-g-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-g.sqlite', 17);
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TRIGGER trg_bots_audit_custom AFTER UPDATE ON bots
        BEGIN
          SELECT 1;
        END;
      `);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_DESTRUCTIVE_OBJECT_LOSS');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case H — Foreign-key drift (altered ON DELETE action) is blocked fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-h-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-h.sqlite', 19);
      const db = new DatabaseSync(dbPath);
      db.exec(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE paper_ledger_positions;
        CREATE TABLE paper_ledger_positions (
          bot_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
          quantity_base INTEGER NOT NULL CHECK (quantity_base > 0),
          entry_price_micro_usd INTEGER NOT NULL CHECK (entry_price_micro_usd > 0),
          leverage_bps INTEGER NOT NULL CHECK (leverage_bps > 0),
          margin_micro_usd INTEGER NOT NULL CHECK (margin_micro_usd >= 0),
          liquidation_price_micro_usd INTEGER NOT NULL DEFAULT 0,
          fencing_token INTEGER NOT NULL DEFAULT 0,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (bot_id, symbol),
          FOREIGN KEY (bot_id) REFERENCES paper_ledger_accounts(bot_id) ON DELETE RESTRICT
        );
        CREATE INDEX idx_paper_ledger_positions_bot_updated
          ON paper_ledger_positions(bot_id, updated_at_ms DESC);
        PRAGMA foreign_keys = ON;
      `);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_SCHEMA_DRIFT');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case I — Partial PR #35 shared-table drift without any of the 10 marker tables is blocked', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-i-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-i.sqlite', 14);
      const db = new DatabaseSync(dbPath);
      db.exec(`ALTER TABLE ops_work_items ADD COLUMN pr35_approval_tier TEXT DEFAULT 'standard';`);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_SCHEMA_DRIFT');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case J — Populated database with application tables but missing d1_migrations history is blocked', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-j-'));
    try {
      const dbPath = createCanonicalPrefixDb(tmpDir, 'case-j.sqlite', 17, { recordMigrations: false });
      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(false);
      expect(res.status).toBe('BLOCK_UNVERIFIABLE_STATE');
      expect(runPreflightCli(dbPath).exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case K — Valid canonical main migration prefixes (pre-0017, post-0017/pre-0018, post-0018/pre-0019, post-0019) pass cleanly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-k-'));
    try {
      for (const stageCount of [16, 17, 18, 19]) {
        const dbPath = createCanonicalPrefixDb(tmpDir, `case-k-${stageCount}.sqlite`, stageCount);
        const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
        expect(res.safeToApplyMainMigrations).toBe(true);
        expect(res.status).toBe('SAFE_SUPPORTED_LINEAGE');
        expect(res.blockers).toEqual([]);
        expect(runPreflightCli(dbPath).exitCode).toBe(0);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Case L — Genuinely empty pristine fresh database passes for fresh-install procedure', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-case-l-'));
    try {
      const dbPath = path.join(tmpDir, 'case-l-fresh.sqlite');
      const db = new DatabaseSync(dbPath);
      db.close();

      const res = preflightDatabaseForMainMigrations(dbPath) as PreflightResultLike;
      expect(res.safeToApplyMainMigrations).toBe(true);
      expect(res.status).toBe('SAFE_SUPPORTED_LINEAGE');
      expect(res.observedStage).toBe('fresh');
      expect(runPreflightCli(dbPath).exitCode).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Adversarial hardening — blocks corrupted SQLite files, missing migrationsDir, spoofed _cf_METADATA, -- inside SQL literals, and malformed d1_migrations', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-preflight-adv-'));
    try {
      // 1. Corrupted non-SQLite file -> BLOCK_UNVERIFIABLE_STATE (exit 2, valid JSON)
      const corruptPath = path.join(tmpDir, 'corrupt.sqlite');
      fs.writeFileSync(corruptPath, 'NOT A SQLITE DATABASE AT ALL');
      const corruptRes = preflightDatabaseForMainMigrations(corruptPath) as PreflightResultLike;
      expect(corruptRes.safeToApplyMainMigrations).toBe(false);
      expect(corruptRes.status).toBe('BLOCK_UNVERIFIABLE_STATE');
      const corruptCli = runPreflightCli(corruptPath);
      expect(corruptCli.exitCode).toBe(2);
      expect(corruptCli.payload.status).toBe('BLOCK_UNVERIFIABLE_STATE');

      // 2. Missing migrationsDir -> BLOCK_UNVERIFIABLE_STATE
      const validFresh = path.join(tmpDir, 'fresh.sqlite');
      const freshDb = new DatabaseSync(validFresh);
      freshDb.close();
      const missingDirRes = preflightDatabaseForMainMigrations(
        validFresh,
        path.join(tmpDir, 'nonexistent-migrations'),
      ) as PreflightResultLike;
      expect(missingDirRes.safeToApplyMainMigrations).toBe(false);
      expect(missingDirRes.status).toBe('BLOCK_UNVERIFIABLE_STATE');

      // 3. Spoofed _cf_METADATA table with arbitrary columns/FK to bots -> BLOCK_SCHEMA_DRIFT
      const spoofedPath = createCanonicalPrefixDb(tmpDir, 'spoofed-meta.sqlite', 17);
      const dbSpoof = new DatabaseSync(spoofedPath);
      dbSpoof.exec(`CREATE TABLE _cf_METADATA (id INTEGER PRIMARY KEY, bot_id TEXT REFERENCES bots(id), secret TEXT);`);
      dbSpoof.close();
      const spoofRes = preflightDatabaseForMainMigrations(spoofedPath) as PreflightResultLike;
      expect(spoofRes.safeToApplyMainMigrations).toBe(false);
      expect(spoofRes.status).toBe('BLOCK_SCHEMA_DRIFT');

      // 4. Partial-index WHERE predicate containing '--' inside string literal must not be stripped
      const litPath = createCanonicalPrefixDb(tmpDir, 'literal-comment.sqlite', 19);
      const dbLit = new DatabaseSync(litPath);
      dbLit.exec(`CREATE INDEX idx_bots_lit ON bots(status) WHERE status != '--staging';`);
      dbLit.close();
      const litRes = preflightDatabaseForMainMigrations(litPath) as PreflightResultLike;
      expect(litRes.safeToApplyMainMigrations).toBe(false);
      expect(litRes.status).toBe('BLOCK_SCHEMA_DRIFT');

      // 5. Malformed d1_migrations (missing applied_at and NULL id) -> BLOCK_UNVERIFIABLE_STATE
      const malformedPath = createCanonicalPrefixDb(tmpDir, 'malformed-hist.sqlite', 17, { recordMigrations: false });
      const dbMal = new DatabaseSync(malformedPath);
      dbMal.exec(`CREATE TABLE d1_migrations (id TEXT, name TEXT);`);
      dbMal.exec(`INSERT INTO d1_migrations (id, name) VALUES (NULL, '0001_initial_schema.sql');`);
      dbMal.close();
      const malRes = preflightDatabaseForMainMigrations(malformedPath) as PreflightResultLike;
      expect(malRes.safeToApplyMainMigrations).toBe(false);
      expect(malRes.status).toBe('BLOCK_UNVERIFIABLE_STATE');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
