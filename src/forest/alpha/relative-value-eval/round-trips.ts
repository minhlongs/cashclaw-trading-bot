// Round-trip extraction from pair-spread simulator output.
// Pure, deterministic — groups periods into flat→position→flat trades.
//
// A trade is a MAXIMAL CONTIGUOUS RUN of non-flat position records: each
// record's position was decided at its timestamp and earns t→t+1, so the run
// covers entry through the last held period; the closing flat record carries
// no exposure and belongs to no trade. Forced exits (closed gate, null β)
// therefore close a trade exactly where they happen.
//
// Trades still open at the end of the series are EXCLUDED from roundTrips
// (their return is unrealized) and reported separately via openTradeCount.

import type { PairPeriodRecord } from '@/tree/alpha/relative-value';

/** One completed flat→position→flat trade. */
export interface PairRoundTrip {
  readonly entryTimestamp: number;
  /** Timestamp of LAST held decision of the trade. */
  readonly exitTimestamp: number;
  readonly direction: 'long_spread' | 'short_spread';
  /** Number of held decision periods (records) in the trade. */
  readonly holdingPeriods: number;
  /** Compounded net return over the held periods. */
  readonly netReturn: number;
  /** Compounded gross return over the held periods. */
  readonly grossReturn: number;
  /** Σ costPct over the held periods. */
  readonly costPct: number;
}

export interface RoundTripExtraction {
  /** Completed trades in chronological order. */
  readonly roundTrips: readonly PairRoundTrip[];
  /** Trades still positioned at series end (unrealized — excluded above). */
  readonly openTradeCount: number;
}

function compound(values: readonly number[]): number {
  let equity = 1;
  for (const v of values) equity *= 1 + v;
  return equity - 1;
}

/**
 * Extract completed round trips from simulator periods. Deterministic;
 * empty input yields no trades and no open positions.
 */
export function extractRoundTrips(
  periods: readonly PairPeriodRecord[],
): RoundTripExtraction {
  const roundTrips: PairRoundTrip[] = [];

  const closeTrade = (): void => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    roundTrips.push({
      entryTimestamp: first.timestamp,
      exitTimestamp: last.timestamp,
      direction: first.position === 'long_spread' ? 'long_spread' : 'short_spread',
      holdingPeriods: current.length,
      netReturn: compound(current.map((p) => p.netReturn)),
      grossReturn: compound(current.map((p) => p.grossReturn)),
      costPct: current.reduce((sum, p) => sum + p.costPct, 0),
    });
    current = [];
  };

  let current: PairPeriodRecord[] = [];
  for (const record of periods) {
    if (record.position === 'flat') {
      // A flat record closes any open trade (forced exits included).
      closeTrade();
      continue;
    }
    current.push(record);
  }
  // Trades still positioned at series end are unrealized — excluded.
  const openTradeCount = current.length > 0 ? 1 : 0;
  return { roundTrips, openTradeCount };
}
