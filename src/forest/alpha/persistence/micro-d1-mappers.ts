// Microstructure D1 row types and mapping functions.
// Pure mapping functions — no I/O, no network, Workers-safe.

import type { DepthLevel, TradePrint } from '@/tree/alpha/microstructure/snapshot-types';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';
import type { DepthSnapshotRecord, TradeBatchRecord } from './micro-store-types';

export interface DepthRow {
  poll_id: string;
  symbol: string;
  timestamp: number;
  bids_json: string;
  asks_json: string;
  levels: number;
  source: string;
  created_at: number;
}

export interface TradeBatchRow {
  batch_id: string;
  poll_id: string;
  symbol: string;
  chunk_index: number;
  first_trade_id: number;
  last_trade_id: number;
  prints_json: string;
  complete: number;
  created_at: number;
}

export interface FeatureVectorRow {
  vector_id: string;
  symbol: string;
  timestamp: number;
  features_json: string;
}

export function rowToDepth(row: DepthRow): DepthSnapshotRecord {
  return {
    pollId: row.poll_id,
    symbol: row.symbol,
    timestamp: row.timestamp,
    bids: JSON.parse(row.bids_json) as DepthLevel[],
    asks: JSON.parse(row.asks_json) as DepthLevel[],
    levels: row.levels,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function rowToTradeBatch(row: TradeBatchRow): TradeBatchRecord {
  return {
    batchId: row.batch_id,
    pollId: row.poll_id,
    symbol: row.symbol,
    chunkIndex: row.chunk_index,
    firstTradeId: row.first_trade_id,
    lastTradeId: row.last_trade_id,
    prints: JSON.parse(row.prints_json) as TradePrint[],
    complete: row.complete === 1,
    createdAt: row.created_at,
  };
}

export function rowToVector(row: FeatureVectorRow): FeatureVector {
  return {
    timestamp: row.timestamp,
    symbol: row.symbol,
    features: JSON.parse(row.features_json) as Record<string, number | null>,
  };
}
