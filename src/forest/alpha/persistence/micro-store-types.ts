// Microstructure Persistence — Types
// Append-only store contract for microstructure ingest (migration 0011).
// INSERT/SELECT only: raw polls and computed vectors are immutable after
// insert; the audit log records one row per poll outcome.

import type { DepthLevel, IngestStatus, TradePrint } from '@/tree/alpha/microstructure/snapshot-types';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';

/** One append-only raw orderbook snapshot row. */
export interface DepthSnapshotRecord {
  /** Unique poll identifier (shared by all rows of one poll). */
  readonly pollId: string;
  readonly symbol: string;
  /** Snapshot capture time in ms epoch (caller-stamped receive time). */
  readonly timestamp: number;
  /** Best bid first (descending price). */
  readonly bids: DepthLevel[];
  /** Best ask first (ascending price). */
  readonly asks: DepthLevel[];
  /** Number of stored levels per side. */
  readonly levels: number;
  /** Data source tag (e.g. 'binance-rest'). */
  readonly source: string;
  readonly createdAt: number;
}

/** One chunk of trade prints (≤500) belonging to a single poll. */
export interface TradeBatchRecord {
  /** Unique batch identifier (one poll may produce several chunks). */
  readonly batchId: string;
  readonly pollId: string;
  readonly symbol: string;
  /** Zero-based position of this chunk within its poll. */
  readonly chunkIndex: number;
  /** Aggregated trade id range covered by this chunk. */
  readonly firstTradeId: number;
  readonly lastTradeId: number;
  readonly prints: TradePrint[];
  /** Whether the whole poll window was fully covered by trade data. */
  readonly complete: boolean;
  readonly createdAt: number;
}

/** One append-only audit-trail entry for a single poll outcome. */
export interface IngestLogRecord {
  readonly logId: string;
  readonly pollId: string;
  readonly symbol: string;
  readonly status: IngestStatus;
  /** Deterministic failure reason; null when status is OK. */
  readonly reason: string | null;
  readonly createdAt: number;
}

/**
 * Append-only persistence contract for microstructure data.
 * Implementations must only issue INSERT and SELECT statements.
 */
export interface MicrostructureStore {
  /** Insert one raw depth snapshot row. */
  appendDepthSnapshot(record: DepthSnapshotRecord): Promise<void>;

  /** Insert one trade-print chunk. */
  appendTradeBatch(record: TradeBatchRecord): Promise<void>;

  /** Insert one computed feature vector. */
  appendFeatureVector(
    vector: FeatureVector,
    opts: { computedAt: number; gitSha: string | null },
  ): Promise<void>;

  /** Append one poll-outcome audit entry. */
  appendIngestLog(record: IngestLogRecord): Promise<void>;

  /** Load depth snapshots in [fromTs, toTs], ascending by timestamp. */
  loadDepthSeries(symbol: string, fromTs: number, toTs: number): Promise<DepthSnapshotRecord[]>;

  /** Load trade chunks whose poll ended within [fromTs, toTs], ordered. */
  loadTradeBatches(symbol: string, fromTs: number, toTs: number): Promise<TradeBatchRecord[]>;

  /** Load stored feature vectors in [fromTs, toTs], ascending by timestamp. */
  loadFeatureVectors(symbol: string, fromTs: number, toTs: number): Promise<FeatureVector[]>;

  /**
   * Highest aggregated trade id persisted for the symbol — resume point so a
   * later poll can fetch only newer prints. Null when nothing is stored.
   */
  lastTradeId(symbol: string): Promise<number | null>;
}
