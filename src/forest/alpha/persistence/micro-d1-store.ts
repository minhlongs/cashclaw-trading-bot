// Microstructure Persistence — Cloudflare D1 implementation.
// INSERT/SELECT only (append-only doctrine, migration 0011). Typed
// against the inlined D1Database interface (Workers-safe).

import type { D1Database } from '@/lib/db/types';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';
import type {
  DepthSnapshotRecord,
  IngestLogRecord,
  MicrostructureStore,
  TradeBatchRecord,
} from './micro-store-types';
import {
  queryDepthSeries,
  queryTradeBatches,
  queryFeatureVectors,
  queryLastTradeId,
} from './micro-d1-queries';

export class D1MicrostructureStore implements MicrostructureStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async appendDepthSnapshot(record: DepthSnapshotRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO micro_depth_snapshots
       (poll_id, symbol, timestamp, bids_json, asks_json, levels, source, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      record.pollId,
      record.symbol,
      record.timestamp,
      JSON.stringify(record.bids),
      JSON.stringify(record.asks),
      record.levels,
      record.source,
      record.createdAt,
    ).run();
  }

  async appendTradeBatch(record: TradeBatchRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO micro_trade_batches
       (batch_id, poll_id, symbol, chunk_index, first_trade_id, last_trade_id,
        prints_json, complete, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      record.batchId,
      record.pollId,
      record.symbol,
      record.chunkIndex,
      record.firstTradeId,
      record.lastTradeId,
      JSON.stringify(record.prints),
      record.complete ? 1 : 0,
      record.createdAt,
    ).run();
  }

  async appendFeatureVector(
    vector: FeatureVector,
    opts: { computedAt: number; gitSha: string | null },
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO micro_feature_vectors
       (vector_id, symbol, timestamp, features_json, computed_at, git_sha, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      `v_${vector.symbol}_${vector.timestamp}`,
      vector.symbol,
      vector.timestamp,
      JSON.stringify(vector.features),
      opts.computedAt,
      opts.gitSha,
      opts.computedAt,
    ).run();
  }

  async appendIngestLog(record: IngestLogRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO micro_ingest_log (log_id, poll_id, symbol, status, reason, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).bind(
      record.logId,
      record.pollId,
      record.symbol,
      record.status,
      record.reason,
      record.createdAt,
    ).run();
  }

  loadDepthSeries(symbol: string, fromTs: number, toTs: number): Promise<DepthSnapshotRecord[]> {
    return queryDepthSeries(this.db, symbol, fromTs, toTs);
  }

  loadTradeBatches(symbol: string, fromTs: number, toTs: number): Promise<TradeBatchRecord[]> {
    return queryTradeBatches(this.db, symbol, fromTs, toTs);
  }

  loadFeatureVectors(symbol: string, fromTs: number, toTs: number): Promise<FeatureVector[]> {
    return queryFeatureVectors(this.db, symbol, fromTs, toTs);
  }

  lastTradeId(symbol: string): Promise<number | null> {
    return queryLastTradeId(this.db, symbol);
  }
}

export function createD1MicroStore(db: D1Database): D1MicrostructureStore {
  return new D1MicrostructureStore(db);
}
