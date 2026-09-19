// Type definitions for the microstructure ingest pipeline.

import type { IngestStatus } from '@/tree/alpha/microstructure/snapshot-types';
import type { MicrostructureStore } from '../persistence/micro-store-types';

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

export interface FetchedPoll {
  readonly receivedAtMs: number;
  readonly depth: { body: unknown };
  readonly trades: { body: unknown };
}
