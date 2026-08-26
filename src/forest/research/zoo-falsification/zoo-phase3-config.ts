// Shared pure config + panel builders for the Phase 3 zoo seed falsification
// run. Both the manual script (scripts/zoo-phase3-falsify.ts) and the
// committed-artifact consistency test import these so the determinism pin
// re-runs the bridge on byte-identical inputs. Pure: no I/O, no randomness.

import type { SymbolPanel } from '@/tree/alpha/factors';
import type { Universe } from '@/tree/alpha/universe/types';
import type { ZooAdapterConfig } from '@/tree/research/alpha/zoo/import-report';

/** The three cached Binance symbols the seed run executes against. */
export const ZOO_SEED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

/** Fixed injected clock so the whole run is deterministic (no wall clock). */
export const ZOO_SEED_NOW_ISO = '2026-08-26T00:00:00.000Z';

/** All zoo market tags — the seed run maps every one to the crypto universe. */
const ALL_ZOO_TAGS = [
  'equity_us',
  'equity_cn',
  'equity_hk',
  'equity_in',
  'equity_kr',
  'crypto',
] as const;

/** The cached crypto universe every zoo market tag resolves to. */
export function buildCryptoUniverse(): Universe {
  return {
    id: 'crypto-core',
    symbols: [...ZOO_SEED_SYMBOLS],
    weighting: 'equal',
    rebalanceRule: 'daily',
  };
}

/**
 * Build the adapter config for the seed run. ALL zoo market tags map to the
 * cached crypto universe — a documented adaptation (Phase 2 D4 precedent):
 * the seed's equity/CN/HK/IN/KR tags are unresolved because no equity data is
 * cached, so mapping them to the crypto universe demonstrates the pipeline
 * end-to-end rather than silently dropping entries. The external-validity
 * caveat is recorded in the report, never hidden.
 */
export function buildSeedAdapterConfig(dataWindow: {
  readonly earliestTimestamp: number;
  readonly latestTimestamp: number;
  readonly barCount: number;
}): ZooAdapterConfig {
  const universe = buildCryptoUniverse();
  const marketUniverses: Record<string, Universe> = {};
  for (const tag of ALL_ZOO_TAGS) marketUniverses[tag] = universe;
  return {
    marketUniverses,
    dataWindow,
    defaultCostMode: 'conservative',
    nowIso: ZOO_SEED_NOW_ISO,
    importerVersion: 'alphazoo-adapter@1',
  };
}

/** One raw candle row as stored in the OHLCV cache files. */
export interface RawCandle {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Convert a symbol's cached candles into a validated SymbolPanel (pure). */
export function panelFromCandles(symbol: string, candles: readonly RawCandle[]): SymbolPanel {
  return {
    symbol,
    timestamps: candles.map((c) => c.timestamp),
    open: candles.map((c) => c.open),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
    volume: candles.map((c) => c.volume),
  };
}

/** Derive the adapter dataWindow from an aligned panel set. */
export function dataWindowFromPanels(panels: readonly SymbolPanel[]): {
  readonly earliestTimestamp: number;
  readonly latestTimestamp: number;
  readonly barCount: number;
} {
  const stamps = panels[0].timestamps;
  return {
    earliestTimestamp: stamps[0],
    latestTimestamp: stamps[stamps.length - 1],
    barCount: stamps.length,
  };
}
