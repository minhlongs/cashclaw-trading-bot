// Microstructure data-quality — trade batch validator.
// Validates a batch of trade prints against an expected poll window.

import type { TradePrint } from './snapshot-types';
import {
  fail,
  isStale,
  MAX_STALE_DRIFT_MS,
  type QualityReport,
} from './quality-types';

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
