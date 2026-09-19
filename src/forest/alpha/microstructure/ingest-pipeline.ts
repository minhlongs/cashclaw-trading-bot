// Microstructure ingest pipeline — one poll per symbol per cron tick.
// Fail-closed contract: any fetch or validation failure appends an audit-log
// row (FETCH_FAILED / DATA_INVALID), skips feature computation for that
// symbol, and never propagates into other symbols' polls.

import {
  parseAggTradesPayload,
  parseDepthPayload,
} from '@/tree/alpha/microstructure/parse';
import { validateDepth, validateTradeBatch } from '@/tree/alpha/microstructure/quality';
import { chunkPrints, freshPrints, isWindowComplete } from './ingest-helpers';
import { persistRaw, computeAndPersistVectors } from './ingest-persist';
import { fetchPoll, auditAndStop } from './ingest-fetch';
import type {
  MicroIngestDeps,
  SymbolIngestOutcome,
  IngestReport,
} from './ingest-types';

export type { MicroIngestDeps, SymbolIngestOutcome, IngestReport };

/**
 * Run one ingest poll for every symbol. Each symbol is fully independent:
 * a fetch or validation failure appends an audit row and moves on without
 * affecting the other symbols.
 */
export async function runMicroIngest(deps: MicroIngestDeps): Promise<IngestReport> {
  const startedAt = deps.now();
  const outcomes = await Promise.all(
    deps.symbols.map((symbol) => pollSymbol(deps, symbol, startedAt)),
  );
  return { startedAt, finishedAt: deps.now(), outcomes };
}

async function pollSymbol(
  deps: MicroIngestDeps,
  symbol: string,
  pollTs: number,
): Promise<SymbolIngestOutcome> {
  const pollId = `poll_${symbol}_${pollTs}`;
  const fetched = await fetchPoll(deps, symbol);
  if ('outcome' in fetched) return fetched.outcome;

  const prevLastId = await deps.store.lastTradeId(symbol);

  const depthParsed = parseDepthPayload(fetched.depth.body, fetched.receivedAtMs);
  if (!depthParsed.ok) {
    return auditAndStop(deps, symbol, pollId, 'DATA_INVALID', depthParsed.reason, pollTs);
  }
  const tradesParsed = parseAggTradesPayload(fetched.trades.body);
  if (!tradesParsed.ok) {
    return auditAndStop(deps, symbol, pollId, 'DATA_INVALID', tradesParsed.reason, pollTs);
  }

  const depthQuality = validateDepth(depthParsed.payload, pollTs);
  if (!depthQuality.valid) {
    return auditAndStop(deps, symbol, pollId, 'DATA_INVALID', depthQuality.reasons[0], pollTs);
  }
  const tradeQuality = validateTradeBatch(tradesParsed.payload, pollTs);
  if (!tradeQuality.valid) {
    return auditAndStop(deps, symbol, pollId, 'DATA_INVALID', tradeQuality.reasons[0], pollTs);
  }

  // Coverage is judged BEFORE resume-point trimming: a gap between the
  // previous poll's last id and this batch's first id means incomplete
  // window — valid data, but trade-based features must stay null.
  const complete = isWindowComplete(tradesParsed.payload, prevLastId);
  const fresh = freshPrints(tradesParsed.payload, prevLastId);

  await persistRaw(deps.store, symbol, pollId, pollTs, depthParsed.payload, fresh, complete);
  const vectors = await computeAndPersistVectors(deps, symbol, pollTs);

  await deps.store.appendIngestLog({
    logId: `log_${symbol}_${pollTs}`,
    pollId,
    symbol,
    status: 'OK',
    reason: null,
    createdAt: pollTs,
  });
  return {
    symbol,
    status: 'OK',
    reason: null,
    depthRows: 1,
    tradeChunks: chunkPrints(fresh).length,
    vectors,
  };
}
