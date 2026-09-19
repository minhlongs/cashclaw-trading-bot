// Fetch orchestration and fail-closed audit helpers for the microstructure ingest pipeline.

import type { IngestStatus } from '@/tree/alpha/microstructure/snapshot-types';
import type { FetchedPoll, MicroIngestDeps, SymbolIngestOutcome } from './ingest-types';

/** Poll window for aggTrades: fetch the last 5 minutes of prints. */
export const POLL_WINDOW_MS = 300_000;

/**
 * Fetch the current depth snapshot and aggTrades window for a single symbol.
 * If either fetch rejects, return a fail-closed SymbolIngestOutcome instead of
 * throwing, so one symbol's failure never aborts the batch.
 */
export async function fetchPoll(
  deps: MicroIngestDeps,
  symbol: string,
): Promise<{ outcome: SymbolIngestOutcome } | FetchedPoll> {
  const receivedAtMs = deps.now();
  type FetchResult = { body: unknown; latencyMs: number };
  const [depthRes, tradesRes] = await Promise.allSettled<FetchResult>([
    deps.fetchDepth(symbol),
    deps.fetchTrades(symbol, Math.max(0, receivedAtMs - POLL_WINDOW_MS), receivedAtMs),
  ]);
  if (depthRes.status === 'rejected') {
    return {
      outcome: await auditAndStop(
        deps,
        symbol,
        `poll_${symbol}_${receivedAtMs}`,
        'FETCH_FAILED',
        `depth fetch failed: ${errText(depthRes.reason)}`,
        receivedAtMs,
      ),
    };
  }
  if (tradesRes.status === 'rejected') {
    return {
      outcome: await auditAndStop(
        deps,
        symbol,
        `poll_${symbol}_${receivedAtMs}`,
        'FETCH_FAILED',
        `trades fetch failed: ${errText(tradesRes.reason)}`,
        receivedAtMs,
      ),
    };
  }
  // Both fulfilled — safe to access .value
  return { receivedAtMs, depth: depthRes.value, trades: tradesRes.value };
}

function errText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Append one fail-closed audit row and return the zero-progress outcome. */
export async function auditAndStop(
  deps: MicroIngestDeps,
  symbol: string,
  pollId: string,
  status: Extract<IngestStatus, 'DATA_INVALID' | 'FETCH_FAILED'>,
  reason: string,
  at: number,
): Promise<SymbolIngestOutcome> {
  await deps.store.appendIngestLog({
    logId: `log_${symbol}_${at}`,
    pollId,
    symbol,
    status,
    reason,
    createdAt: at,
  });
  return { symbol, status, reason, depthRows: 0, tradeChunks: 0, vectors: 0 };
}
