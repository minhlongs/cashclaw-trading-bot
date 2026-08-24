// Shared fixtures for microstructure feature-computer tests.
// Test-only helpers — never imported by production code.

import type { AggregatedTrades, ValidatedSnapshot } from './types';

export const SYMBOL = 'BTCUSDT';

/** Build one validated snapshot from raw [price, quantity] level pairs. */
export function makeSnapshot(
  ts: number,
  bids: ReadonlyArray<readonly [number, number]>,
  asks: ReadonlyArray<readonly [number, number]>,
  trades: AggregatedTrades | null = null,
): ValidatedSnapshot {
  return {
    timestamp: ts,
    symbol: SYMBOL,
    depth: {
      lastUpdateId: ts,
      exchangeTs: ts,
      bids: bids.map(([price, quantity]) => ({ price, quantity })),
      asks: asks.map(([price, quantity]) => ({ price, quantity })),
    },
    trades,
  };
}

/** Build an aggregated trade window ending at `ts`. */
export function makeTrades(
  ts: number,
  buyVolume: number,
  sellVolume: number,
  complete = true,
): AggregatedTrades {
  return { timestamp: ts, buyVolume, sellVolume, complete };
}
