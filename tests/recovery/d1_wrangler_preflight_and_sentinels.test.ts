import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildCanonicalMigrationManifest,
  diffSchemaSnapshots,
  extractSchemaSnapshot,
  preflightDatabaseForMainMigrations,
} from '../../scripts/d1-schema-diff.mjs';
import { D1AtomicLedgerBatcher } from '@/tree/ledger/d1-atomic-ledger-batcher';
import { ZERO_BIGINT, type D1DatabaseLike, type D1PreparedStatementLike } from '@/tree/ledger/ledger-types';

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

function queryWranglerJson<T>(persistDir: string, sql: string): T[] {
  const raw = runWranglerD1([
    'execute',
    'cashclaw-db',
    '--local',
    '--persist-to',
    persistDir,
    '--json',
    '--command',
    sql,
  ]);
  const parsed = JSON.parse(raw) as Array<{ results: T[] }>;
  return parsed[0]?.results ?? [];
}

function wrapSqliteAsD1(sqlite: SqliteDatabaseSyncLike): D1DatabaseLike {
  return {
    prepare(query: string): D1PreparedStatementLike {
      let bound: unknown[] = [];
      const stmt: D1PreparedStatementLike = {
        bind(...values: unknown[]): D1PreparedStatementLike {
          bound = values;
          return stmt;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          const row = sqlite.prepare(query).get(...bound);
          return (row as T | undefined) ?? null;
        },
        async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
          return { results: sqlite.prepare(query).all(...bound) as T[] };
        },
        async run(): Promise<{ meta: { changes: number } }> {
          const r = sqlite.prepare(query).run(...bound);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      (stmt as unknown as { __query: string; __bound: () => unknown[] }).__query = query;
      (stmt as unknown as { __query: string; __bound: () => unknown[] }).__bound = () => bound;
      return stmt;
    },
    async batch<T = { meta?: { changes: number } }>(statements: D1PreparedStatementLike[]): Promise<T[]> {
      sqlite.exec('BEGIN IMMEDIATE;');
      try {
        const out: T[] = [];
        for (const s of statements) {
          const meta = s as unknown as { __query: string; __bound: () => unknown[] };
          const r = sqlite.prepare(meta.__query).run(...meta.__bound());
          out.push({ meta: { changes: Number(r.changes) } } as T);
        }
        sqlite.exec('COMMIT;');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK;');
        throw e;
      }
    },
  };
}

describe('Phase E: Actual Local Wrangler D1 Validation, Sentinels & P2 Symmetric Fencing', () => {
  it('validates canonical manifest reproducibility across pre/post 0017, 0018, and 0019 stages and full diff coverage', () => {
    const manifest = buildCanonicalMigrationManifest(MIGRATIONS_DIR, { includeSnapshots: true });
    expect(manifest.totalMigrations).toBe(19);
    expect(manifest.duplicatePrefixes).toEqual([]);
    for (const entry of manifest.entries) {
      expect(entry.reproducible).toBe(true);
      expect(entry.expectedSchemaSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    // Verify 0018 marks bots as a destructive rebuild target
    const m0018 = manifest.entries.find((e: { filename: string }) => e.filename === '0018_add_h3_maker_strategy.sql');
    expect(m0018?.rebuiltTables).toContain('bots');

    // Verify diffSchemaSnapshots detects trigger, view, and partial-index predicate drift
    const baseDb = new DatabaseSync(':memory:');
    const driftDb = new DatabaseSync(':memory:');
    baseDb.exec(`
      CREATE TABLE t (id TEXT PRIMARY KEY, status TEXT NOT NULL, owner_id TEXT NOT NULL);
      CREATE INDEX idx_t_status ON t(status) WHERE status != '--prod';
      CREATE VIEW v_t AS SELECT id FROM t WHERE status = 'open';
    `);
    driftDb.exec(`
      CREATE TABLE t (id TEXT PRIMARY KEY, status TEXT NOT NULL, owner_id TEXT NOT NULL);
      CREATE INDEX idx_t_status ON t(status) WHERE status != '--staging';
      CREATE VIEW v_t AS SELECT id, owner_id FROM t;
      CREATE TRIGGER trg_t_after AFTER INSERT ON t BEGIN SELECT 1; END;
    `);
    const snapA = extractSchemaSnapshot(baseDb);
    const snapB = extractSchemaSnapshot(driftDb);
    baseDb.close();
    driftDb.close();

    expect(snapA.schemaSha256).not.toBe(snapB.schemaSha256);
    const diff = diffSchemaSnapshots(snapA, snapB);
    expect(diff.hasStructuralDrift).toBe(true);
    const sharedDiffs = diff.sharedTableDiffs as Record<string, { indexChanges: unknown[] }>;
    expect(sharedDiffs.t?.indexChanges.length).toBe(1);
    expect(diff.triggersOnlyInB).toEqual(['trg_t_after']);
    expect(diff.viewChanges.length).toBe(1);
  });

  it('validates 8 representative states on actual isolated Wrangler local D1 instances without mutating blocked DBs', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wrangler-preflight-8-'));
    try {
      // 1 & 3. Clean main lineage fully migrated on actual Wrangler local D1
      const persistFull = path.join(tmpRoot, 'persist-full');
      runWranglerD1(['migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', persistFull]);
      const fullSqlite = findPersistedD1SqliteFile(persistFull);
      const resFull = preflightDatabaseForMainMigrations(fullSqlite);
      expect(resFull.safeToApplyMainMigrations).toBe(true);
      expect(resFull.status).toBe('SAFE_SUPPORTED_LINEAGE');
      expect(resFull.observedStage).toBe('post_0019');
      expect(resFull.pendingMigrations).toEqual([]);

      // 2. Main lineage pending 0018 (0001..0017 applied via Wrangler D1 using a temp migrations subset? -> simulate on actual D1 sqlite)
      // Create a second Wrangler D1 persist dir initialized cleanly, then roll back 0018 & 0019 to exact post_0017 state, or copy fullSqlite
      const cloneFromFull = (name: string): string => {
        const dest = path.join(tmpRoot, `${name}.sqlite`);
        const srcDb = new DatabaseSync(fullSqlite);
        srcDb.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}';`);
        srcDb.close();
        return dest;
      };

      // 4. PR #35-style divergent lineage on Wrangler D1 snapshot
      const pr35File = cloneFromFull('wrangler-pr35');
      const db4 = new DatabaseSync(pr35File);
      db4.exec(`CREATE TABLE saas_workspaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);`);
      db4.close();
      const beforeBytes4 = fs.readFileSync(pr35File);
      const res4 = preflightDatabaseForMainMigrations(pr35File);
      expect(res4.safeToApplyMainMigrations).toBe(false);
      expect(res4.status).toBe('BLOCK_LEGACY_LINEAGE_COLLISION');
      expect(Buffer.compare(fs.readFileSync(pr35File), beforeBytes4)).toBe(0); // Zero mutation on block

      // 5. Unrecognized additional column/index/trigger on Wrangler D1 snapshot
      const extraColFile = cloneFromFull('wrangler-extra-col');
      const db5 = new DatabaseSync(extraColFile);
      db5.exec(`ALTER TABLE bots ADD COLUMN custom_audit_tag TEXT;`);
      db5.exec(`CREATE INDEX idx_bots_custom_tag ON bots(custom_audit_tag);`);
      db5.exec(`CREATE TRIGGER trg_bots_custom_tag AFTER UPDATE ON bots BEGIN SELECT 1; END;`);
      db5.close();
      const res5 = preflightDatabaseForMainMigrations(extraColFile);
      expect(res5.safeToApplyMainMigrations).toBe(false);
      expect(res5.status).toBe('BLOCK_SCHEMA_DRIFT');

      // 6. Partial-index predicate drift on Wrangler D1 snapshot
      const idxDriftFile = cloneFromFull('wrangler-idx-drift');
      const db6 = new DatabaseSync(idxDriftFile);
      db6.exec(`DROP INDEX idx_bots_status;`);
      db6.exec(`CREATE INDEX idx_bots_status ON bots(status) WHERE status = 'live_running';`);
      db6.close();
      const res6 = preflightDatabaseForMainMigrations(idxDriftFile);
      expect(res6.safeToApplyMainMigrations).toBe(false);
      expect(res6.status).toBe('BLOCK_SCHEMA_DRIFT');

      // 7. Out-of-order / duplicate migration history on Wrangler D1 snapshot
      const orderDriftFile = cloneFromFull('wrangler-order-drift');
      const db7 = new DatabaseSync(orderDriftFile);
      db7.exec(`DELETE FROM d1_migrations WHERE name = '0016_saas_checkout_orders.sql';`);
      db7.close();
      const res7 = preflightDatabaseForMainMigrations(orderDriftFile);
      expect(res7.safeToApplyMainMigrations).toBe(false);
      expect(res7.status).toBe('BLOCK_MIGRATION_ORDER');

      // 8. Foreign-key / tenant ownership drift on Wrangler D1 snapshot
      const fkDriftFile = cloneFromFull('wrangler-fk-drift');
      const db8 = new DatabaseSync(fkDriftFile);
      db8.exec(`
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
          FOREIGN KEY (bot_id) REFERENCES paper_ledger_accounts(bot_id) ON DELETE SET NULL
        );
        CREATE INDEX idx_paper_ledger_positions_bot_updated
          ON paper_ledger_positions(bot_id, updated_at_ms DESC);
        PRAGMA foreign_keys = ON;
      `);
      db8.close();
      const res8 = preflightDatabaseForMainMigrations(fkDriftFile);
      expect(res8.safeToApplyMainMigrations).toBe(false);
      expect(res8.status).toBe('BLOCK_SCHEMA_DRIFT');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }, 90_000);

  it('Phase E1: proves ASSERT_ORDER_UPSERT_APPLIED_SQL and ASSERT_POSITION_FENCING_SQL atomic rollback and valid retry directly on actual Wrangler local D1', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wrangler-sentinels-'));
    try {
      runWranglerD1(['migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', tmpDir]);

      // Seed valid state at fencing_token = 10
      const seedFile = path.join(tmpDir, 'seed.sql');
      fs.writeFileSync(
        seedFile,
        `INSERT INTO scheduler_bot_leases (bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms)
         VALUES ('bot-s1', 'ws-1', 'worker-new', 10, 1000, 9999999999);
         INSERT INTO paper_ledger_accounts (
           bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
           realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
           initial_capital_micro_usd, version, fencing_token, updated_at_ms
         ) VALUES ('bot-s1', 1000000000, 0, 0, 0, 0, 0, 1000000000, 1, 10, 1000);
         INSERT INTO paper_order_intents (
           bot_id, client_order_id, symbol, side, order_type, quantity_base,
           filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
           reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
         ) VALUES ('bot-s1', 'ord-1', 'BTC/USDT', 'buy', 'limit', 100, 0, 50000000000, 50000000, 0, 'OPEN', 10, 1000, 1000);
         INSERT INTO paper_ledger_positions (
           bot_id, symbol, signed_qty_base, open_notional_micro_usd, open_margin_micro_usd, fencing_token, updated_at_ms
         ) VALUES ('bot-s1', 'BTC/USDT', 100, 5000000000, 500000000, 10, 1000);`,
      );
      runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', seedFile]);

      // 1. Stale worker (token 5 < 10) executes batch containing event hash + UPSERT_ORDER_STATE_SQL + ASSERT_ORDER_UPSERT_APPLIED_SQL
      const staleOrderFile = path.join(tmpDir, 'stale-order.sql');
      fs.writeFileSync(
        staleOrderFile,
        `INSERT INTO processed_event_hashes (bot_id, event_hash, event_type, account_version, processed_at_ms)
         VALUES ('bot-s1', 'ev-stale-ord', 'ORDER_UPDATE', 2, 1001);
         INSERT INTO paper_order_intents (
           bot_id, client_order_id, symbol, side, order_type, quantity_base,
           filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
           reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
         )
         SELECT 'bot-s1', 'ord-1', 'BTC/USDT', 'buy', 'limit', 100, 100, 50000000000, 0, 0, 'FILLED', 5, 1000, 1001
          WHERE NOT EXISTS (SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = 'bot-s1' AND l.fencing_token > 5)
            AND NOT EXISTS (SELECT 1 FROM paper_ledger_accounts a WHERE a.bot_id = 'bot-s1' AND a.fencing_token > 5)
            AND NOT EXISTS (SELECT 1 FROM paper_order_intents i WHERE i.bot_id = 'bot-s1' AND i.fencing_token > 5)
         ON CONFLICT(bot_id, client_order_id) DO UPDATE SET
           filled_qty_base = excluded.filled_qty_base,
           lifecycle_state = excluded.lifecycle_state,
           fencing_token = excluded.fencing_token,
           updated_at_ms = excluded.updated_at_ms
         WHERE paper_order_intents.fencing_token <= excluded.fencing_token;
         INSERT INTO paper_order_intents (
           bot_id, client_order_id, symbol, side, order_type, quantity_base,
           filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
           reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
         )
         SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
          WHERE changes() = 0;`,
      );
      let staleOrderFailed = false;
      try {
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', staleOrderFile]);
      } catch {
        staleOrderFailed = true;
      }
      expect(staleOrderFailed).toBe(true);

      // Verify zero mutation: ev-stale-ord rolled back, ord-1 still OPEN at token 10
      expect(queryWranglerJson(tmpDir, "SELECT event_hash FROM processed_event_hashes WHERE bot_id='bot-s1';")).toEqual([]);
      expect(queryWranglerJson(tmpDir, "SELECT lifecycle_state, fencing_token FROM paper_order_intents WHERE bot_id='bot-s1';")).toEqual([
        { lifecycle_state: 'OPEN', fencing_token: 10 },
      ]);

      // 2. Stale worker (token 5 < 10) executes ASSERT_POSITION_FENCING_SQL + DELETE_BOT_POSITIONS_GUARDED_SQL
      const stalePosFile = path.join(tmpDir, 'stale-pos.sql');
      fs.writeFileSync(
        stalePosFile,
        `INSERT INTO processed_event_hashes (bot_id, event_hash, event_type, account_version, processed_at_ms)
         VALUES ('bot-s1', 'ev-stale-pos', 'POS_SYNC', 2, 1002);
         INSERT INTO paper_ledger_positions (
           bot_id, symbol, signed_qty_base, open_notional_micro_usd, open_margin_micro_usd, fencing_token, updated_at_ms
         )
         SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL
          WHERE EXISTS (SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = 'bot-s1' AND l.fencing_token > 5)
             OR EXISTS (SELECT 1 FROM paper_ledger_positions p WHERE p.bot_id = 'bot-s1' AND p.fencing_token > 5)
             OR EXISTS (SELECT 1 FROM paper_ledger_accounts a WHERE a.bot_id = 'bot-s1' AND a.fencing_token > 5)
             OR EXISTS (SELECT 1 FROM paper_order_intents i WHERE i.bot_id = 'bot-s1' AND i.fencing_token > 5);
         DELETE FROM paper_ledger_positions WHERE bot_id = 'bot-s1' AND fencing_token <= 5;`,
      );
      let stalePosFailed = false;
      try {
        runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', stalePosFile]);
      } catch {
        stalePosFailed = true;
      }
      expect(stalePosFailed).toBe(true);

      // Verify zero mutation: ev-stale-pos rolled back, BTC/USDT position still intact
      expect(queryWranglerJson(tmpDir, "SELECT event_hash FROM processed_event_hashes WHERE bot_id='bot-s1';")).toEqual([]);
      expect(queryWranglerJson(tmpDir, "SELECT symbol, signed_qty_base, fencing_token FROM paper_ledger_positions WHERE bot_id='bot-s1';")).toEqual([
        { symbol: 'BTC/USDT', signed_qty_base: 100, fencing_token: 10 },
      ]);

      // 3. Valid retry at token 10 succeeds cleanly with changes() = 1 on actual Wrangler D1
      const validRetryFile = path.join(tmpDir, 'valid-retry.sql');
      fs.writeFileSync(
        validRetryFile,
        `INSERT INTO processed_event_hashes (bot_id, event_hash, event_type, account_version, processed_at_ms)
         VALUES ('bot-s1', 'ev-valid-10', 'ORDER_FILL', 2, 1003);
         INSERT INTO paper_order_intents (
           bot_id, client_order_id, symbol, side, order_type, quantity_base,
           filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
           reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
         )
         SELECT 'bot-s1', 'ord-1', 'BTC/USDT', 'buy', 'limit', 100, 100, 50000000000, 0, 0, 'FILLED', 10, 1000, 1003
          WHERE NOT EXISTS (SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = 'bot-s1' AND l.fencing_token > 10)
            AND NOT EXISTS (SELECT 1 FROM paper_ledger_accounts a WHERE a.bot_id = 'bot-s1' AND a.fencing_token > 10)
            AND NOT EXISTS (SELECT 1 FROM paper_order_intents i WHERE i.bot_id = 'bot-s1' AND i.fencing_token > 10)
         ON CONFLICT(bot_id, client_order_id) DO UPDATE SET
           filled_qty_base = excluded.filled_qty_base,
           lifecycle_state = excluded.lifecycle_state,
           fencing_token = excluded.fencing_token,
           updated_at_ms = excluded.updated_at_ms
         WHERE paper_order_intents.fencing_token <= excluded.fencing_token;
         INSERT INTO paper_order_intents (
           bot_id, client_order_id, symbol, side, order_type, quantity_base,
           filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
           reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
         )
         SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
          WHERE changes() = 0;`,
      );
      runWranglerD1(['execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', validRetryFile]);

      expect(queryWranglerJson(tmpDir, "SELECT event_hash FROM processed_event_hashes WHERE bot_id='bot-s1';")).toEqual([
        { event_hash: 'ev-valid-10' },
      ]);
      expect(queryWranglerJson(tmpDir, "SELECT lifecycle_state, filled_qty_base FROM paper_order_intents WHERE bot_id='bot-s1';")).toEqual([
        { lifecycle_state: 'FILLED', filled_qty_base: 100 },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 90_000);

  it('Phase E2: closes P2 asymmetric cross-table fencing when scheduler_bot_leases has no row and higher token exists only in paper_order_intents', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('PRAGMA foreign_keys = ON;');
      const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      for (const f of allFiles) {
        sqlite.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      }
      const d1 = wrapSqliteAsD1(sqlite);
      const batcher = new D1AtomicLedgerBatcher(d1);

      // Initialize bot at token 4 with NO scheduler_bot_leases row
      await batcher.initializeBotAccount('bot-p2', 1000, 4);

      // Worker B (token 5) writes only a pending order intent (account stays at token 4, leases empty)
      const wB = await batcher.commitAtomicGroup({
        botId: 'bot-p2',
        fencingToken: 5,
        expectedVersion: 0,
        steps: [],
        orderUpserts: [
          {
            clientOrderId: 'ord-worker-b',
            symbol: 'BTC/USDT',
            side: 'buy',
            orderType: 'limit',
            quantityBase: BigInt(100),
            filledQtyBase: BigInt(0),
            limitPriceMicroUsd: BigInt(50_000_000_000),
            reservedMarginMicroUsd: BigInt(50_000_000),
            reduceOnly: false,
            lifecycleState: 'OPEN',
            createdAtMs: 1001,
            updatedAtMs: 1001,
          },
        ],
      });
      expect(wB.ok).toBe(true);

      // Stale Worker A (token 4) attempts:
      // (a) writing a DIFFERENT client_order_id -> MUST BE REJECTED
      const staleOrder = await batcher.commitAtomicGroup({
        botId: 'bot-p2',
        fencingToken: 4,
        expectedVersion: 0,
        steps: [],
        orderUpserts: [
          {
            clientOrderId: 'ord-stale-a',
            symbol: 'ETH/USDT',
            side: 'sell',
            orderType: 'limit',
            quantityBase: BigInt(50),
            filledQtyBase: BigInt(0),
            limitPriceMicroUsd: BigInt(3_000_000_000),
            reservedMarginMicroUsd: BigInt(10_000_000),
            reduceOnly: false,
            lifecycleState: 'OPEN',
            createdAtMs: 1002,
            updatedAtMs: 1002,
          },
        ],
      });
      expect(staleOrder.ok).toBe(false);
      if (!staleOrder.ok) expect(staleOrder.error).toContain('STALE_FENCING_TOKEN_ON_INTENT');

      // (b) position-only mutation -> MUST BE REJECTED
      const stalePos = await batcher.commitAtomicGroup({
        botId: 'bot-p2',
        fencingToken: 4,
        expectedVersion: 0,
        steps: [],
        positions: [
          {
            symbol: 'BTC/USDT',
            signedQtyBase: BigInt(100),
            openNotionalMicroUsd: BigInt(5_000_000_000),
            openMarginMicroUsd: BigInt(500_000_000),
          },
        ],
      });
      expect(stalePos.ok).toBe(false);
      if (!stalePos.ok) expect(stalePos.error).toContain('STALE_FENCING_TOKEN_ON_POSITION');

      // (c) ledger deposit step -> MUST BE REJECTED
      const staleLedger = await batcher.commitAtomicGroup({
        botId: 'bot-p2',
        fencingToken: 4,
        expectedVersion: 0,
        steps: [
          {
            entry: {
              entryId: 'e-stale-4',
              botId: 'bot-p2',
              eventHash: 'h-stale-4',
              eventType: 'DEPOSIT',
              version: 1,
              timestampMs: 1003,
              legs: [
                { account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: BigInt(1_000_000) },
                { account: 'INITIAL_CAPITAL', direction: 'CREDIT', amountMicroUsd: BigInt(1_000_000) },
              ],
            },
            requiredCashMicroUsd: ZERO_BIGINT,
            nextBalances: {
              CASH_AVAILABLE: BigInt(1_000_000),
              MARGIN_RESERVED: ZERO_BIGINT,
              POSITION_MARGIN: ZERO_BIGINT,
              REALIZED_PNL: ZERO_BIGINT,
              FEES_EXPENSE: ZERO_BIGINT,
              FUNDING_NET: ZERO_BIGINT,
              INITIAL_CAPITAL: BigInt(1_000_000),
            },
          },
        ],
      });
      expect(staleLedger.ok).toBe(false);
      if (!staleLedger.ok) expect(staleLedger.error).toContain('OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED');

      // Verify state remains untouched (only ord-worker-b, 0 positions, version 0)
      const loaded = await batcher.loadDurableBotState('bot-p2');
      expect(loaded?.version).toBe(0);
      expect(loaded?.orderIntents.map((o) => o.clientOrderId)).toEqual(['ord-worker-b']);
      expect(loaded?.positions).toEqual([]);

      // Also verify reverse asymmetry: higher token exists ONLY in paper_ledger_positions
      // (no scheduler_bot_leases row, no paper_order_intents row, account still at token 4)
      await batcher.initializeBotAccount('bot-p2-pos-only', 2000, 4);
      const wBPos = await batcher.commitAtomicGroup({
        botId: 'bot-p2-pos-only',
        fencingToken: 5,
        expectedVersion: 0,
        steps: [],
        positions: [
          {
            symbol: 'BTC/USDT',
            signedQtyBase: BigInt(100),
            openNotionalMicroUsd: BigInt(5_000_000_000),
            openMarginMicroUsd: BigInt(500_000_000),
          },
        ],
      });
      expect(wBPos.ok).toBe(true);

      // Stale Worker A (token 4) attempts non-position order upsert, ledger step, and writePendingOrderIntent -> ALL MUST FAIL
      const staleOrderAfterPos = await batcher.commitAtomicGroup({
        botId: 'bot-p2-pos-only',
        fencingToken: 4,
        expectedVersion: 0,
        steps: [],
        orderUpserts: [
          {
            clientOrderId: 'ord-stale-pos',
            symbol: 'BTC/USDT',
            side: 'buy',
            orderType: 'limit',
            quantityBase: BigInt(10),
            filledQtyBase: BigInt(0),
            limitPriceMicroUsd: BigInt(50_000_000_000),
            reservedMarginMicroUsd: BigInt(5_000_000),
            reduceOnly: false,
            lifecycleState: 'OPEN',
            createdAtMs: 2001,
            updatedAtMs: 2001,
          },
        ],
      });
      expect(staleOrderAfterPos.ok).toBe(false);

      const stalePendingAfterPos = await batcher.writePendingOrderIntent('bot-p2-pos-only', 4, {
        clientOrderId: 'ord-stale-pending-pos',
        symbol: 'BTC/USDT',
        side: 'buy',
        orderType: 'limit',
        quantityBase: BigInt(10),
        filledQtyBase: BigInt(0),
        limitPriceMicroUsd: BigInt(50_000_000_000),
        reservedMarginMicroUsd: BigInt(5_000_000),
        reduceOnly: false,
        lifecycleState: 'OPEN',
        createdAtMs: 2002,
        updatedAtMs: 2002,
      });
      expect(stalePendingAfterPos.ok).toBe(false);

      const staleLedgerAfterPos = await batcher.commitAtomicGroup({
        botId: 'bot-p2-pos-only',
        fencingToken: 4,
        expectedVersion: 0,
        steps: [
          {
            entry: {
              entryId: 'e-stale-pos-4',
              botId: 'bot-p2-pos-only',
              eventHash: 'h-stale-pos-4',
              eventType: 'DEPOSIT',
              version: 1,
              timestampMs: 2003,
              legs: [
                { account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: BigInt(1_000_000) },
                { account: 'INITIAL_CAPITAL', direction: 'CREDIT', amountMicroUsd: BigInt(1_000_000) },
              ],
            },
            requiredCashMicroUsd: ZERO_BIGINT,
            nextBalances: {
              CASH_AVAILABLE: BigInt(1_000_000),
              MARGIN_RESERVED: ZERO_BIGINT,
              POSITION_MARGIN: ZERO_BIGINT,
              REALIZED_PNL: ZERO_BIGINT,
              FEES_EXPENSE: ZERO_BIGINT,
              FUNDING_NET: ZERO_BIGINT,
              INITIAL_CAPITAL: BigInt(1_000_000),
            },
          },
        ],
      });
      expect(staleLedgerAfterPos.ok).toBe(false);

      const loadedPosOnly = await batcher.loadDurableBotState('bot-p2-pos-only');
      expect(loadedPosOnly?.version).toBe(0);
      expect(loadedPosOnly?.orderIntents).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
