// Shared deterministic fixtures for zoo-falsification bridge tests (Phase 3).
// Fixed fixtures only — ZERO unseeded randomness. Pure: no I/O.

import type { SymbolPanel } from '@/tree/alpha/factors';
import type { ZooAdapterConfig } from '@/tree/research/alpha/zoo/import-report';
import { runZooFalsification, type ZooFalsificationConfig } from './run-zoo-falsification';

export const SYMBOLS = ['S0', 'S1', 'S2'];
export const NOW = '2026-08-26T00:00:00.000Z';

export function makeConfig(): ZooAdapterConfig {
  return {
    marketUniverses: {
      crypto: { id: 'crypto', symbols: SYMBOLS, weighting: 'equal', rebalanceRule: 'daily' },
    },
    dataWindow: { earliestTimestamp: 0, latestTimestamp: 86_400_000 * 1000, barCount: 1000 },
    defaultCostMode: 'conservative',
    nowIso: NOW,
    importerVersion: 'alphazoo-adapter@1',
  };
}

export function bridgeConfig(): ZooFalsificationConfig {
  return { adapterConfig: makeConfig() };
}

/** Geometric-growth panel: distinct forward returns per symbol. */
export function growthPanel(symbol: string, mult: number, n: number): SymbolPanel {
  const timestamps = Array.from({ length: n }, (_, i) => i * 86_400_000);
  const close = Array.from({ length: n }, (_, i) => 100 * Math.pow(mult, i));
  return {
    symbol,
    timestamps,
    open: close.map((c) => c * 0.99),
    high: close.map((c) => c * 1.01),
    low: close.map((c) => c * 0.99),
    close,
    volume: Array.from({ length: n }, (_, i) => 1000 + i),
  };
}

export function panels(n = 60): SymbolPanel[] {
  return [growthPanel('S0', 1.01, n), growthPanel('S1', 1.02, n), growthPanel('S2', 1.005, n)];
}

/** O-2 fixture: open constant-over-time per symbol, distinct across symbols. */
export function o2Panels(): SymbolPanel[] {
  const n = 60;
  const build = (symbol: string, growth: number, openConst: number): SymbolPanel => {
    const timestamps = Array.from({ length: n }, (_, i) => i * 86_400_000);
    const close = Array.from({ length: n }, (_, i) => 100 * Math.pow(growth, i));
    return {
      symbol,
      timestamps,
      open: Array.from({ length: n }, () => openConst),
      high: close.map((c) => c * 1.01),
      low: close.map((c) => c * 0.99),
      close,
      volume: Array.from({ length: n }, (_, i) => 1000 + i),
    };
  };
  return [build('S0', 1.01, 10), build('S1', 1.02, 20), build('S2', 1.01, 30)];
}

export function entry(id: string, formula: string, decay = 5): Record<string, unknown> {
  return {
    id,
    nickname: id,
    theme: ['volume'],
    formula_latex: formula,
    columns_required: ['open', 'volume'],
    extras_required: [],
    requires_sector: false,
    universe: ['crypto'],
    frequency: ['1d'],
    decay_horizon: decay,
    min_warmup_bars: 5,
    notes: 'fixture',
  };
}

export function manifest(entries: Record<string, unknown>[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceRepository: 'github.com/example/vibe-trading',
    sourceVersion: 'abc1234',
    extractedAt: NOW,
    entries,
  };
}

export async function run(entries: Record<string, unknown>[], panelSet: SymbolPanel[] = panels()) {
  return runZooFalsification(manifest(entries), panelSet, bridgeConfig());
}
