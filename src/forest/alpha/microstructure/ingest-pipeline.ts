// Microstructure ingest pipeline — one poll per symbol per cron tick.
// Fail-closed contract: any fetch or validation failure appends an audit-log
// row (FETCH_FAILED / DATA_INVALID), skips feature computation for that
// symbol, and never propagates into other symbols' polls.

import {
  parseAggTradesPayload,
  parseDepthPayload,
} from '@/tree/alpha/microstructure/parse';
import { validateDepth, validateTradeBatch } from '@/tree/alpha/microstructure/quality';
import type { IngestStatus } from '@/tree/alpha/microstructure/snapshot-types';
import type { MicrostructureStore } from '../persistence/micro-store-types';
import { chunkPrints, freshPrints, isWindowComplete } from './ingest-helpers';
import { persistRaw, computeAndPersistVectors } from './ingest-persist';

/** Poll window for aggTrades: fetch the last 5 minutes of prints. */
const POLL_WINDOW_MS = 300_000;

export interface MicroIngestDeps {
  readonly store: MicrostructureStore;
  /** Fetch the current depth snapshot; resolves with the RAW body + latency. */
  readonly fetchDepth: (symbol: string) => Promise<{ body: unknown; latencyMs: number }>;
  /** Fetch aggregated trades in [startMs, endMs]; RAW body + latency. */
  readonly fetchTrades: (
    symbol: string,
    startMs: number,
    endMs: number,
  ) => Promise<{ body: unknown; latencyMs: number }>;
  /** Poll wall clock in ms epoch (injected for determinism). */
  readonly now: () => number;
  /** Symbols to poll this tick. */
  readonly symbols: readonly string[];
  /** Git SHA persisted with every feature vector (observability). */
  readonly gitSha?: string;
}

/** Per-symbol outcome recorded in the audit log and returned to the caller. */
export interface SymbolIngestOutcome {
  readonly symbol: string;
  readonly status: IngestStatus;
  /** Deterministic failure reason; null when status is OK. */
  readonly reason: string | null;
  /** Raw depth rows appended (0 unless OK). */
  readonly depthRows: number;
  /** Trade chunks appended (0 unless OK). */
  readonly tradeChunks: number;
  /** Feature vectors appended this poll. */
  readonly vectors: number;
}

export interface IngestReport {
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly outcomes: readonly SymbolIngestOutcome[];
}

interface FetchedPoll {
  readonly receivedAtMs: number;
  readonly depth: { body: unknown };
  readonly trades: { body: unknown };
}

// ── Poll orchestration ────────────────────────────────────────────────────────

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

async function fetchPoll(
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
async function auditAndStop(
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
