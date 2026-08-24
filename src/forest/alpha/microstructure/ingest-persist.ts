// Persistence + feature-computation tail of the ingest pipeline.
// Split from ingest-pipeline.ts to keep both files under 200 lines.

import { computeFeatureVectors } from '@/tree/alpha/microstructure/feature-computer';
import type { DepthPayload, TradePrint } from '@/tree/alpha/microstructure/snapshot-types';
import type {
  DepthSnapshotRecord,
  MicrostructureStore,
  TradeBatchRecord,
} from '../persistence/micro-store-types';
import { buildSeries, chunkPrints } from './ingest-helpers';

/** Append one raw depth row plus the trade prints chunked at ≤500 per row. */
export async function persistRaw(
  store: MicrostructureStore,
  symbol: string,
  pollId: string,
  pollTs: number,
  depth: DepthPayload,
  prints: TradePrint[],
  complete: boolean,
): Promise<void> {
  const depthRecord: DepthSnapshotRecord = {
    pollId,
    symbol,
    timestamp: pollTs,
    bids: depth.bids,
    asks: depth.asks,
    levels: depth.bids.length,
    source: 'binance-rest',
    createdAt: pollTs,
  };
  await store.appendDepthSnapshot(depthRecord);

  const chunks = chunkPrints(prints);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const record: TradeBatchRecord = {
      batchId: `${pollId}_chunk${i}`,
      pollId,
      symbol,
      chunkIndex: i,
      firstTradeId: chunk[0].id,
      lastTradeId: chunk[chunk.length - 1].id,
      prints: chunk,
      complete,
      createdAt: pollTs,
    };
    await store.appendTradeBatch(record);
  }
}

/**
 * Reload the stored series (including this poll's just-persisted rows) and
 * compute causal feature vectors at asOf = pollTs. Only the newest vector —
 * this poll's timestamp — is appended: historical vectors are immutable and
 * were already persisted by their own polls (append-only doctrine).
 */
export async function computeAndPersistVectors(
  deps: {
    readonly store: MicrostructureStore;
    readonly gitSha?: string;
  },
  symbol: string,
  pollTs: number,
): Promise<number> {
  const [depths, batches] = await Promise.all([
    deps.store.loadDepthSeries(symbol, 0, pollTs),
    deps.store.loadTradeBatches(symbol, 0, pollTs),
  ]);
  const series = buildSeries(depths, batches);
  const vectors = computeFeatureVectors(series, pollTs);
  const latest = vectors[vectors.length - 1];
  if (latest === undefined || latest.timestamp !== pollTs) return 0;

  await deps.store.appendFeatureVector(latest, {
    computedAt: pollTs,
    gitSha: deps.gitSha ?? null,
  });
  return 1;
}
