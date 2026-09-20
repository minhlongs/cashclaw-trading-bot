// Microstructure data-quality — shared report type + staleness gate.
// Pure helpers used by both `validateDepth` and `validateTradeBatch`.

import type { DepthPayload } from './snapshot-types';

/** Result of a data-quality validation run. */
export interface QualityReport {
  valid: boolean;
  /** Ordered reasons for the *first* violation, if any. */
  reasons: string[];
  /** Whether the trade batch covers the expected window completely. */
  complete?: boolean;
}

export function ok(): QualityReport {
  return { valid: true, reasons: [] };
}

export function fail(reason: string): QualityReport {
  return { valid: false, reasons: [reason] };
}

/** Maximum tolerated age of a payload at validation time. */
export const MAX_STALE_DRIFT_MS = 60_000; // 60 seconds

/**
 * Shared staleness gate: a payload whose exchange timestamp lags the poll
 * clock by more than MAX_STALE_DRIFT_MS is rejected as stale.
 */
export function isStale(exchangeTs: number, nowMs: number): boolean {
  return Math.abs(nowMs - exchangeTs) > MAX_STALE_DRIFT_MS;
}

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
