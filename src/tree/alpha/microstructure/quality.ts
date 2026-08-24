// Microstructure data-quality checks — pure functions, no I/O.
// Every check returns a QualityReport; callers decide whether to persist
// or log. `now` is always received as a parameter, never Date.now().

import type { DepthPayload, TradePrint } from './snapshot-types';

/** Result of a data-quality validation run. */
export interface QualityReport {
  valid: boolean;
  /** Ordered reasons for the *first* violation, if any. */
  reasons: string[];
  /** Whether the trade batch covers the expected window completely. */
  complete?: boolean;
}

function ok(): QualityReport {
  return { valid: true, reasons: [] };
}

function fail(reason: string): QualityReport {
  return { valid: false, reasons: [reason] };
}

/** Maximum tolerated age of a payload at validation time. */
export const MAX_STALE_DRIFT_MS = 60_000; // 60 seconds

/**
 * Shared staleness gate: a payload whose exchange timestamp lags the poll
 * clock by more than MAX_STALE_DRIFT_MS is rejected as stale.
 */
function isStale(exchangeTs: number, nowMs: number): boolean {
  return Math.abs(nowMs - exchangeTs) > MAX_STALE_DRIFT_MS;
}

// ── Depth quality ─────────────────────────────────────────────────────────────

/**
 * Validate a single depth snapshot.
 *
 * Checks:
 * - best bid < best ask (no crossed or locked book)
 * - all quantities > 0 (no empty levels from a faulty feed)
 * - bids descending by price
 * - asks ascending by price
 *
 * @param nowMs current wall clock (avoids Date.now() for determinism).
 */
export function validateDepth(
  payload: DepthPayload,
  nowMs: number,
): QualityReport {
  const { bids, asks, exchangeTs } = payload;

  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    return fail('invalid nowMs parameter');
  }

  if (bids.length === 0) return fail('bids empty');
  if (asks.length === 0) return fail('asks empty');

  if (isStale(exchangeTs, nowMs)) {
    return fail(
      `stale depth: drift ${(nowMs - exchangeTs).toFixed(0)} ms exceeds ${MAX_STALE_DRIFT_MS} ms`,
    );
  }

  // Crossed book: best bid >= best ask means feed is inconsistent.
  if (bids[0].price >= asks[0].price) {
    return fail(
      `crossed book: best_bid ${bids[0].price} >= best_ask ${asks[0].price}`,
    );
  }

  // Quantities must all be positive.
  for (const lvl of bids) {
    if (lvl.quantity <= 0) return fail(`bid level qty ${lvl.quantity} <= 0`);
  }
  for (const lvl of asks) {
    if (lvl.quantity <= 0) return fail(`ask level qty ${lvl.quantity} <= 0`);
  }

  // Ordering checks.
  for (let i = 1; i < bids.length; i++) {
    if (bids[i].price >= bids[i - 1].price) {
      return fail(`bids not descending: lvl ${i} price ${bids[i].price} >= lvl ${i - 1}`);
    }
  }
  for (let i = 1; i < asks.length; i++) {
    if (asks[i].price <= asks[i - 1].price) {
      return fail(`asks not ascending: lvl ${i} price ${asks[i].price} <= lvl ${i - 1}`);
    }
  }

  return ok();
}

// ── Trade batch quality ───────────────────────────────────────────────────────

/**
 * Validate a batch of trade prints against an expected poll window.
 *
 * Checks:
 * - timestamps monotonically non-decreasing
 * - no duplicate trade ids
 * - exchangeTs vs nowMs staleness (drift > MAX_STALE_DRIFT_MS → invalid)
 * - batch coverage: first/last trade id must span at least `windowTradeIds`
 *   consecutive ids for `complete=true`
 *
 * @param prints   parsed trade prints (already field-validated by parse.ts).
 * @param nowMs    wall clock at poll time.
 * @param windowTradeIds expected minimum id range to call the batch complete
 *                       (default 1 — any non-empty batch qualifies).
 */
export function validateTradeBatch(
  prints: TradePrint[],
  nowMs: number,
  windowTradeIds = 1,
): QualityReport {
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    return fail('invalid nowMs parameter');
  }
  if (prints.length === 0) return fail('trade batch empty');

  // Staleness.
  const lastPrintTs = prints[prints.length - 1].ts;
  if (isStale(lastPrintTs, nowMs)) {
    return fail(
      `stale: poll drift ${(nowMs - lastPrintTs).toFixed(0)} ms exceeds ${MAX_STALE_DRIFT_MS} ms`,
    );
  }

  // Timestamp monotonicity.
  for (let i = 1; i < prints.length; i++) {
    if (prints[i].ts < prints[i - 1].ts) {
      return fail(
        `non-monotonic timestamp at index ${i}: ${prints[i].ts} < ${prints[i - 1].ts}`,
      );
    }
  }

  // Duplicate id check.
  const seenIds = new Set<number>();
  for (let i = 0; i < prints.length; i++) {
    if (seenIds.has(prints[i].id)) {
      return fail(`duplicate trade id ${prints[i].id} at index ${i}`);
    }
    seenIds.add(prints[i].id);
  }

  // Coverage: lastId − firstId ≥ windowTradeIds → complete.
  const firstId = prints[0].id;
  const lastId = prints[prints.length - 1].id;
  const complete = lastId - firstId >= windowTradeIds;

  return { valid: true, reasons: [], complete };
}
