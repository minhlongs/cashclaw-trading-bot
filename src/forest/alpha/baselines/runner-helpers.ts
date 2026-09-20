// Baseline strategy runner — shared helper functions & indicators
// Pure helper functions used across baseline strategy implementations.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { CostConfig, StressMode } from '@/forest/backtest/cost-model';
import { indicators } from '@/tree/alpha/indicators';

// ── Deterministic PRNG (LCG) ──────────────────────────────
export function lcg(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
}

// ── Cost helper ──────────────────────────────────────────
export function costConfig(stressMode: StressMode, feePct: number, slipPct: number): CostConfig {
  const m = stressMode === 'conservative' ? 2 : stressMode === 'adverse' ? 3 : 1;
  return { feePct: feePct * m, slipPct: slipPct * m, marketImpactPct: 0 };
}

export function makeTrade(
  entryTs: number, exitTs: number, side: 'buy' | 'sell',
  entry: number, exit: number, fee: number,
): BacktestTrade {
  const netPnl = (side === 'buy' ? exit - entry : entry - exit) - fee;
  return {
    entryTimestamp: entryTs, exitTimestamp: exitTs, side,
    entryPrice: entry, exitPrice: exit, quantity: 1,
    pnl: netPnl, fee, pnlPct: entry > 0 ? netPnl / entry : 0,
    holdingMinutes: (exitTs - entryTs) / 60_000,
  };
}

// ── Indicators (delegates to canonical @/tree/alpha/indicators) ────

/** Canonical indicators operate from the end of the array; this adapter
 *  restores the original (candles, end, period) contract by slicing. */
export function sma(candles: Candle[], end: number, period: number): number {
  const result = indicators.sma(candles.slice(0, end + 1), period);
  return typeof result.value === 'number' ? result.value : 0;
}

export function atr(candles: Candle[], end: number, period: number): number {
  const result = indicators.atr(candles.slice(0, end + 1), period);
  return typeof result.value === 'number' ? result.value : 0;
}
