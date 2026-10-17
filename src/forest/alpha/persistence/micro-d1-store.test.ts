// Microstructure D1 Store — Append Operations Tests
// Verifies the append-only doctrine at the SQL level: every write issues an
// INSERT (never UPDATE/DELETE).

import { describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';
import type { DepthLevel, TradePrint } from '@/tree/alpha/microstructure/snapshot-types';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';
import { createD1MicroStore } from './micro-d1-store';
import type { DepthSnapshotRecord, IngestLogRecord, TradeBatchRecord } from './micro-store-types';

interface RecordedStatement {
  readonly sql: string;
  readonly values: readonly unknown[];
}

function createRecordingDb(): {
  db: D1Database;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const makeStatement = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind(...bound: unknown[]): D1PreparedStatement {
        values = bound;
        return statement;
      },
      first: async <T = unknown>() => {
        statements.push({ sql, values });
        return null as T | null;
      },
      firstRow: async <T = unknown>() => null as T | null,
      all: async <T>() => {
        statements.push({ sql, values });
        return { results: [] as T[], meta: { duration: 0 } };
      },
      run: async () => {
        statements.push({ sql, values });
        return { meta: { changes: 1, last_row_id: 1, duration: 0 } };
      },
    };
    return statement;
  };

  const db: D1Database = {
    prepare: (sql: string) => makeStatement(sql),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => '',
  };

  return { db, statements };
}

const BIDS: DepthLevel[] = [
  { price: 104_063.99, quantity: 0.5 },
  { price: 104_062.0, quantity: 1.25 },
];
const ASKS: DepthLevel[] = [
  { price: 104_064.5, quantity: 0.75 },
  { price: 104_066.01, quantity: 2 },
];

function makeDepthRecord(overrides: Partial<DepthSnapshotRecord> = {}): DepthSnapshotRecord {
  return {
    pollId: 'poll-1',
    symbol: 'BTCUSDT',
    timestamp: 1_000_000,
    bids: BIDS,
    asks: ASKS,
    levels: 2,
    source: 'binance-rest',
    createdAt: 1_000_000,
    ...overrides,
  };
}

const PRINTS: TradePrint[] = [
  { id: 101, price: 104_064.0, quantity: 0.01, isBuyerMaker: false, ts: 999_000 },
  { id: 102, price: 104_064.5, quantity: 0.02, isBuyerMaker: true, ts: 999_500 },
];

function makeTradeBatch(overrides: Partial<TradeBatchRecord> = {}): TradeBatchRecord {
  return {
    batchId: 'batch-1',
    pollId: 'poll-1',
    symbol: 'BTCUSDT',
    chunkIndex: 0,
    firstTradeId: PRINTS[0].id,
    lastTradeId: PRINTS[PRINTS.length - 1].id,
    prints: PRINTS,
    complete: true,
    createdAt: 1_000_000,
    ...overrides,
  };
}

const FEATURES: FeatureVector = {
  timestamp: 1_000_000,
  symbol: 'BTCUSDT',
  features: {
    bid_ask_spread: 0.51,
    order_book_imbalance: null,
    depth_imbalance: null,
    trade_imbalance: null,
    aggressive_volume: null,
    volume_delta: null,
    liquidity_shock: null,
    realized_spread: null,
    price_impact: null,
  },
};

function makeIngestLog(overrides: Partial<IngestLogRecord> = {}): IngestLogRecord {
  return {
    logId: 'log-1',
    pollId: 'poll-1',
    symbol: 'BTCUSDT',
    status: 'OK',
    reason: null,
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe('D1MicrostructureStore — Append Operations', () => {
  describe('appendDepthSnapshot', () => {
    it('issues an INSERT INTO micro_depth_snapshots (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendDepthSnapshot(makeDepthRecord());
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO micro_depth_snapshots');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    });

    it('binds fields in column order, serializing sides as JSON', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendDepthSnapshot(makeDepthRecord());
      const values = statements[0].values;
      expect(values[0]).toBe('poll-1');
      expect(values[1]).toBe('BTCUSDT');
      expect(values[2]).toBe(1_000_000);
      expect(values[3]).toBe(JSON.stringify(BIDS));
      expect(values[4]).toBe(JSON.stringify(ASKS));
      expect(values[5]).toBe(2);
      expect(values[6]).toBe('binance-rest');
      expect(values[7]).toBe(1_000_000);
    });
  });

  describe('appendTradeBatch', () => {
    it('issues an INSERT INTO micro_trade_batches (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendTradeBatch(makeTradeBatch());
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO micro_trade_batches');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    });

    it('binds prints JSON and complete flag as 0/1 integer', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendTradeBatch(makeTradeBatch({ complete: false }));
      const values = statements[0].values;
      expect(values[6]).toBe(JSON.stringify(PRINTS));
      expect(values[7]).toBe(0);
    });
  });

  describe('appendFeatureVector', () => {
    it('issues an INSERT INTO micro_feature_vectors (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendFeatureVector(FEATURES, { computedAt: 2_000, gitSha: 'sha1' });
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO micro_feature_vectors');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    });

    it('derives a deterministic vector_id and binds the feature payload', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendFeatureVector(FEATURES, { computedAt: 2_000, gitSha: 'sha1' });
      const values = statements[0].values;
      expect(values[0]).toBe('v_BTCUSDT_1000000');
      expect(values[1]).toBe('BTCUSDT');
      expect(values[2]).toBe(1_000_000);
      expect(values[3]).toBe(JSON.stringify(FEATURES.features));
      expect(values[4]).toBe(2_000);
      expect(values[5]).toBe('sha1');
    });
  });

  describe('appendIngestLog', () => {
    it('issues an INSERT INTO micro_ingest_log (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1MicroStore(db).appendIngestLog(makeIngestLog({ status: 'DATA_INVALID', reason: 'bad' }));
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO micro_ingest_log');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
      expect(statements[0].values).toEqual(['log-1', 'poll-1', 'BTCUSDT', 'DATA_INVALID', 'bad', 1_000_000]);
    });
  });
});
