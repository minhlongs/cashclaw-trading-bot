// Payload parsers for Binance REST microstructure responses.
// Pure functions: unknown in → PollResult out. Bad data yields {ok:false}
// with a specific reason; control-flow throws are forbidden here so callers
// cannot accidentally skip the fail-closed audit path.

import type {
  DepthLevel,
  DepthPayload,
  PollResult,
  RawPollPayload,
  TradePrint,
} from './snapshot-types';

/** Minimum plausible epoch-ms timestamp (2000-01-01). */
const MIN_TS_MS = 946_684_800_000;

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** Validate one [price, quantity] pair arriving as a wire array. */
function parseDepthLevel(raw: unknown): DepthLevel | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [price, qty] = raw;
  if (!isFinitePositive(price) || !isFinitePositive(qty)) return null;
  return { price, quantity: qty };
}

/** Parse one side of the book; null when any level fails validation. */
function parseDepthSide(raw: unknown[]): DepthLevel[] | null {
  const levels: DepthLevel[] = [];
  for (const level of raw) {
    const parsed = parseDepthLevel(level);
    if (!parsed) return null;
    levels.push(parsed);
  }
  return levels;
}

/**
 * Parse a depth response `{lastUpdateId, bids:[[p,q],…], asks:[[p,q],…]}`.
 * Both sides must be non-empty; level ordering is checked later by
 * validateDepth (quality.ts), not here — parse only certifies field shape.
 *
 * @param receivedAtMs stamp for exchangeTs (moment the body was received).
 */
export function parseDepthPayload(
  raw: RawPollPayload,
  receivedAtMs: number,
): PollResult<DepthPayload> {
  if (!isFiniteNonNegative(receivedAtMs)) {
    return { ok: false, reason: 'depth: invalid receivedAtMs' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'depth: payload is not an object' };
  }
  const body = raw as Record<string, unknown>;
  const rawUpdateId = body['lastUpdateId'];
  if (
    typeof rawUpdateId !== 'number' ||
    !Number.isInteger(rawUpdateId) ||
    rawUpdateId <= 0
  ) {
    return { ok: false, reason: 'depth: lastUpdateId missing or not positive integer' };
  }
  const lastUpdateId: number = rawUpdateId;

  const bidsRaw = body['bids'];
  const asksRaw = body['asks'];
  if (!Array.isArray(bidsRaw) || bidsRaw.length === 0) {
    return { ok: false, reason: 'depth: bids missing or empty' };
  }
  if (!Array.isArray(asksRaw) || asksRaw.length === 0) {
    return { ok: false, reason: 'depth: asks missing or empty' };
  }

  const bids = parseDepthSide(bidsRaw);
  if (!bids) return { ok: false, reason: 'depth: malformed bid level' };
  const asks = parseDepthSide(asksRaw);
  if (!asks) return { ok: false, reason: 'depth: malformed ask level' };

  return { ok: true, payload: { lastUpdateId, bids, asks, exchangeTs: receivedAtMs } };
}

/**
 * Parse an aggTrades response: `[{"a":id,"p":price,"q":qty,"T":ts,"m":bool},…]`.
 * The array must be non-empty and every print fully valid — one bad print
 * rejects the whole batch (fail-closed, no partial snapshots).
 */
export function parseAggTradesPayload(
  raw: unknown,
): PollResult<TradePrint[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: 'trades: payload is not a non-empty array' };
  }

  const prints: TradePrint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: `trades[${i}]: entry is not an object` };
    }
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e['a']) || (e['a'] as number) <= 0) {
      return { ok: false, reason: `trades[${i}]: id 'a' missing or not positive integer` };
    }
    if (!isFinitePositive(e['p'])) {
      return { ok: false, reason: `trades[${i}]: price 'p' missing or not finite positive` };
    }
    if (!isFinitePositive(e['q'])) {
      return { ok: false, reason: `trades[${i}]: qty 'q' missing or not finite positive` };
    }
    if (
      typeof e['T'] !== 'number' ||
      !Number.isFinite(e['T']) ||
      (e['T'] as number) < MIN_TS_MS
    ) {
      return { ok: false, reason: `trades[${i}]: ts 'T' missing or implausible (< year 2000)` };
    }
    if (typeof e['m'] !== 'boolean') {
      return { ok: false, reason: `trades[${i}]: flag 'm' missing or not boolean` };
    }
    prints.push({
      id: e['a'] as number,
      price: e['p'],
      quantity: e['q'],
      isBuyerMaker: e['m'],
      ts: e['T'],
    });
  }

  return { ok: true, payload: prints };
}
