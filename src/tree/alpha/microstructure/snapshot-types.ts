// Raw microstructure payload contracts — pure types, zero I/O.
// Shapes mirror the Binance REST v3 responses AFTER the forest layer converts
// string numerics ("104063.99") to numbers; parse.ts enforces that conversion
// happened by rejecting anything that is not a finite positive number.

/** One price level of an order-book depth snapshot. */
export interface DepthLevel {
  price: number;
  quantity: number;
}

/**
 * Parsed depth snapshot from GET /api/v3/depth.
 *
 * Ordering (enforced downstream by quality.ts): bids are sorted descending by
 * price, asks ascending, so index 0 is the best quote on each side.
 */
export interface DepthPayload {
  lastUpdateId: number;
  /** Best bid first (descending price). */
  bids: DepthLevel[];
  /** Best ask first (ascending price). */
  asks: DepthLevel[];
  /**
   * Exchange-side timestamp in ms epoch. The depth endpoint carries no server
   * timestamp, so the caller stamps the moment the body was received; quality
   * checks later compare it against poll time to detect staleness.
   */
  exchangeTs: number;
}

/**
 * One aggregated trade print from GET /api/v3/aggTrades (fields a/p/q/m/T).
 * Extra wire fields (f, l, M) are intentionally dropped — nothing consumes
 * them today (YAGNI).
 */
export interface TradePrint {
  /** Aggregated trade id — unique per symbol, strictly increasing over time. */
  id: number;
  price: number;
  quantity: number;
  /** true = buyer is the maker, i.e. the aggressor was a seller. */
  isBuyerMaker: boolean;
  /** Trade time in ms epoch (wire field T). */
  ts: number;
}

/** Unparsed HTTP body from one poll — untrusted until parse.ts validates it. */
export type RawPollPayload = unknown;

/** Successful parse outcome carrying the validated payload. */
export interface PollSuccess<T> {
  ok: true;
  payload: T;
}

/** Failed parse outcome with a deterministic, human-readable reason. */
export interface PollFailure {
  ok: false;
  reason: string;
}

/**
 * Discriminated union for fail-closed validation: callers must narrow on `ok`
 * before touching the payload. Parsing NEVER throws for bad data.
 */
export type PollResult<T> = PollSuccess<T> | PollFailure;

/** Audit-trail status recorded per poll (micro_ingest_log.status). */
export type IngestStatus = 'OK' | 'DATA_INVALID' | 'FETCH_FAILED';
