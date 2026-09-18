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
  type DepthRow,
  type FeatureVectorRow,
  type TradeBatchRow,
  rowToDepth,
  rowToTradeBatch,
  rowToVector,
} from './micro-d1-mappers';

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

  async loadDepthSeries(symbol: string, fromTs: number, toTs: number): Promise<DepthSnapshotRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT poll_id, symbol, timestamp, bids_json, asks_json, levels, source, created_at
       FROM micro_depth_snapshots
       WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
    ).bind(symbol, fromTs, toTs).all<DepthRow>();
    return (results ?? []).map(rowToDepth);
  }

  async loadTradeBatches(symbol: string, fromTs: number, toTs: number): Promise<TradeBatchRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT batch_id, poll_id, symbol, chunk_index, first_trade_id,
              last_trade_id, prints_json, complete, created_at
       FROM micro_trade_batches
       WHERE symbol = ? AND created_at >= ? AND created_at <= ?
       ORDER BY poll_id ASC, chunk_index ASC`,
    ).bind(symbol, fromTs, toTs).all<TradeBatchRow>();
    return (results ?? []).map(rowToTradeBatch);
  }

  async loadFeatureVectors(symbol: string, fromTs: number, toTs: number): Promise<FeatureVector[]> {
    const { results } = await this.db.prepare(
      `SELECT vector_id, symbol, timestamp, features_json
       FROM micro_feature_vectors
       WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
    ).bind(symbol, fromTs, toTs).all<FeatureVectorRow>();
    return (results ?? []).map(rowToVector);
  }

  async lastTradeId(symbol: string): Promise<number | null> {
    const row = await this.db.prepare(
      `SELECT last_trade_id FROM micro_trade_batches
       WHERE symbol = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(symbol).first<{ last_trade_id: number }>();
    return row === null ? null : row.last_trade_id;
  }
}

export function createD1MicroStore(db: D1Database): D1MicrostructureStore {
  return new D1MicrostructureStore(db);
}
