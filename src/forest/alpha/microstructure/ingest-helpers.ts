// Pure assembly helpers for the microstructure ingest pipeline.
// No I/O — everything here maps already-fetched or already-stored data
// between raw records and the tree-layer ValidatedSnapshot shape.

import type { TradePrint } from '@/tree/alpha/microstructure/snapshot-types';
import type { AggregatedTrades, ValidatedSnapshot } from '@/tree/alpha/microstructure/types';
import type {
  DepthSnapshotRecord,
  TradeBatchRecord,
} from '../persistence/micro-store-types';

/** Max prints per persisted chunk — keeps rows far below D1's 1MB limit. */
export const MAX_PRINTS_PER_CHUNK = 500;

/** Split prints into ordered chunks of at most MAX_PRINTS_PER_CHUNK. */
export function chunkPrints(prints: readonly TradePrint[]): TradePrint[][] {
  const chunks: TradePrint[][] = [];
  for (let i = 0; i < prints.length; i += MAX_PRINTS_PER_CHUNK) {
    chunks.push(prints.slice(i, i + MAX_PRINTS_PER_CHUNK));
  }
  return chunks;
}

/** Notional volume (price × qty) split by aggressor side. */
export function aggregateNotional(
  prints: readonly TradePrint[],
): { buyVolume: number; sellVolume: number } {
  let buyVolume = 0;
  let sellVolume = 0;
  for (const print of prints) {
    const notional = print.price * print.quantity;
    // m=true means buyer is the maker → the aggressor was a seller.
    if (print.isBuyerMaker) sellVolume += notional;
    else buyVolume += notional;
  }
  return { buyVolume, sellVolume };
}

/**
 * Prints newer than the previous poll's last id (resume-point dedupe so
 * overlapping REST windows never double-count the boundary prints).
 */
export function freshPrints(
  prints: readonly TradePrint[],
  prevLastId: number | null,
): TradePrint[] {
  if (prevLastId === null) return [...prints];
  return prints.filter((p) => p.id > prevLastId);
}

/**
 * Window coverage rule: the batch is complete only when its first id
 * continues exactly where the previous poll stopped (no gap). First-ever
 * poll has no prior reference, so any non-empty validated batch counts.
 */
export function isWindowComplete(
  prints: readonly TradePrint[],
  prevLastId: number | null,
): boolean {
  if (prevLastId === null) return true;
  return prints[0].id <= prevLastId + 1;
}

/**
 * Rebuild the causal feature-computation series from stored rows.
 * Depth snapshots pair with their poll's trade chunks by poll_id; a snapshot
 * without stored trades gets trades=null (trade features stay null downstream).
 */
export function buildSeries(
  depths: readonly DepthSnapshotRecord[],
  batches: readonly TradeBatchRecord[],
): ValidatedSnapshot[] {
  const printsByPoll = new Map<string, TradePrint[]>();
  const completeByPoll = new Map<string, boolean>();
  for (const batch of batches) {
    const existing = printsByPoll.get(batch.pollId);
    if (existing) existing.push(...batch.prints);
    else printsByPoll.set(batch.pollId, [...batch.prints]);
    if (!completeByPoll.has(batch.pollId)) completeByPoll.set(batch.pollId, batch.complete);
  }

  return depths.map((depth) => {
    const prints = printsByPoll.get(depth.pollId);
    const complete = completeByPoll.get(depth.pollId) ?? false;
    const trades: AggregatedTrades | null =
      prints === undefined
        ? null
        : { timestamp: depth.timestamp, ...aggregateNotional(prints), complete };
    return { timestamp: depth.timestamp, symbol: depth.symbol, depth: toDepthPayload(depth), trades };
  });
}

function toDepthPayload(record: DepthSnapshotRecord): ValidatedSnapshot['depth'] {
  return { lastUpdateId: 0, bids: record.bids, asks: record.asks, exchangeTs: record.timestamp };
}
