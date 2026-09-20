// Microstructure Persistence — D1 query helpers.
// Pure query delegation functions for read-only access to micro tables.

import type { D1Database } from '@/lib/db/types';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';
import type { DepthSnapshotRecord, TradeBatchRecord } from './micro-store-types';
import {
  type DepthRow,
  type FeatureVectorRow,
  type TradeBatchRow,
  rowToDepth,
  rowToTradeBatch,
  rowToVector,
} from './micro-d1-mappers';

export async function queryDepthSeries(
  db: D1Database,
  symbol: string,
  fromTs: number,
  toTs: number,
): Promise<DepthSnapshotRecord[]> {
  const { results } = await db.prepare(
    `SELECT poll_id, symbol, timestamp, bids_json, asks_json, levels, source, created_at
     FROM micro_depth_snapshots
     WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
  ).bind(symbol, fromTs, toTs).all<DepthRow>();
  return (results ?? []).map(rowToDepth);
}

export async function queryTradeBatches(
  db: D1Database,
  symbol: string,
  fromTs: number,
  toTs: number,
): Promise<TradeBatchRecord[]> {
  const { results } = await db.prepare(
    `SELECT batch_id, poll_id, symbol, chunk_index, first_trade_id,
            last_trade_id, prints_json, complete, created_at
     FROM micro_trade_batches
     WHERE symbol = ? AND created_at >= ? AND created_at <= ?
     ORDER BY poll_id ASC, chunk_index ASC`,
  ).bind(symbol, fromTs, toTs).all<TradeBatchRow>();
  return (results ?? []).map(rowToTradeBatch);
}

export async function queryFeatureVectors(
  db: D1Database,
  symbol: string,
  fromTs: number,
  toTs: number,
): Promise<FeatureVector[]> {
  const { results } = await db.prepare(
    `SELECT vector_id, symbol, timestamp, features_json
     FROM micro_feature_vectors
     WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
  ).bind(symbol, fromTs, toTs).all<FeatureVectorRow>();
  return (results ?? []).map(rowToVector);
}

export async function queryLastTradeId(
  db: D1Database,
  symbol: string,
): Promise<number | null> {
  const row = await db.prepare(
    `SELECT last_trade_id FROM micro_trade_batches
     WHERE symbol = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(symbol).first<{ last_trade_id: number }>();
  return row === null ? null : row.last_trade_id;
}
