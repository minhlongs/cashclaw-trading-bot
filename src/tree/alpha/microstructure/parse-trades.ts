// aggTrades payload parser for Binance REST microstructure responses.
// Pure functions: unknown in → PollResult out. Bad data yields {ok:false}
// with a specific reason; control-flow throws are forbidden here so callers
// cannot accidentally skip the fail-closed audit path.

import type { PollResult, TradePrint } from './snapshot-types';
import { isFinitePositive, MIN_TS_MS } from './parse-depth';

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
