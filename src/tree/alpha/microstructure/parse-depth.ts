// Depth payload parsers for Binance REST microstructure responses.
// Pure functions: unknown in → PollResult out. Bad data yields {ok:false}
// with a specific reason; control-flow throws are forbidden here so callers
// cannot accidentally skip the fail-closed audit path.

import type {
  DepthLevel,
  DepthPayload,
  PollResult,
  RawPollPayload,
} from './snapshot-types';

/** Minimum plausible epoch-ms timestamp (2000-01-01). */
export const MIN_TS_MS = 946_684_800_000;

export function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** Validate one [price, quantity] pair arriving as a wire array. */
export function parseDepthLevel(raw: unknown): DepthLevel | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [price, qty] = raw;
  if (!isFinitePositive(price) || !isFinitePositive(qty)) return null;
  return { price, quantity: qty };
}

/** Parse one side of the book; null when any level fails validation. */
export function parseDepthSide(raw: unknown[]): DepthLevel[] | null {
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
