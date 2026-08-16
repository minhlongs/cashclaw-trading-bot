// Baseline strategy runner — deterministic benchmark strategies for alpha evaluation
// Produces EvaluationReport for each baseline: buy_hold, random_entry, momentum, mean_reversion

import type { Candle } from '@/forest/backtest/ohlcv';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { CostConfig, StressMode } from '@/forest/backtest/cost-model';
import type { BaselineConfig } from './types';
import { indicators } from '@/tree/alpha/indicators';
import { buildReport, emptyReport } from './report-builder';

// ── Deterministic PRNG (LCG) ──────────────────────────────
function lcg(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
}

// ── Cost helper ──────────────────────────────────────────
function costConfig(stressMode: StressMode, feePct: number, slipPct: number): CostConfig {
  const m = stressMode === 'conservative' ? 2 : stressMode === 'adverse' ? 3 : 1;
  return { feePct: feePct * m, slipPct: slipPct * m, marketImpactPct: 0 };
}

function makeTrade(
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

// ── Signal: Buy & Hold ───────────────────────────────────
function buyAndHold(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
  if (candles.length < 2) return [];
  const entry = candles[0].close * (1 + cfg.slipPct);
  const exit = candles[candles.length - 1].close * (1 - cfg.slipPct);
  const fee = Math.abs(entry + exit) * cfg.feePct;
  return [makeTrade(candles[0].timestamp, candles[candles.length - 1].timestamp, 'buy', entry, exit, fee)];
}

// ── Signal: Random Entry ─────────────────────────────────
function randomEntry(candles: Candle[], cfg: CostConfig, seed: number): BacktestTrade[] {
  if (candles.length < 2) return [];
  const rand = lcg(seed);
  const hold = 10;
  const trades: BacktestTrade[] = [];
  let i = 0;
  while (i + hold < candles.length) {
    const entry = candles[i].close * (1 + cfg.slipPct);
    const exit = candles[i + hold].close * (1 - cfg.slipPct);
    const side: 'buy' | 'sell' = rand() > 0.5 ? 'buy' : 'sell';
    const fee = Math.abs(entry + exit) * cfg.feePct;
    trades.push(makeTrade(candles[i].timestamp, candles[i + hold].timestamp, side, entry, exit, fee));
    i += hold + 1;
  }
  return trades;
}

// ── Indicators (delegates to canonical @/tree/alpha/indicators) ────

/** Canonical indicators operate from the end of the array; this adapter
 *  restores the original (candles, end, period) contract by slicing. */
function sma(candles: Candle[], end: number, period: number): number {
  const result = indicators.sma(candles.slice(0, end + 1), period);
  return typeof result.value === 'number' ? result.value : 0;
}

function atr(candles: Candle[], end: number, period: number): number {
  const result = indicators.atr(candles.slice(0, end + 1), period);
  return typeof result.value === 'number' ? result.value : 0;
}

// ── Signal: Simple Momentum ──────────────────────────────
function simpleMomentum(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
  if (candles.length < 31) return [];
  const trades: BacktestTrade[] = [];
  let entryIdx = -1;
  let entryPrice = 0;
  for (let i = 30; i < candles.length; i++) {
    const s10 = sma(candles, i, 10);
    const s30 = sma(candles, i, 30);
    const prev10 = sma(candles, i - 1, 10);
    const prev30 = sma(candles, i - 1, 30);
    if (entryIdx === -1 && prev10 <= prev30 && s10 > s30) {
      entryIdx = i;
      entryPrice = candles[i].close * (1 + cfg.slipPct);
    } else if (entryIdx !== -1 && prev10 >= prev30 && s10 < s30) {
      const exit = candles[i].close * (1 - cfg.slipPct);
      const fee = Math.abs(entryPrice + exit) * cfg.feePct;
      trades.push(makeTrade(candles[entryIdx].timestamp, candles[i].timestamp, 'buy', entryPrice, exit, fee));
      entryIdx = -1;
    }
  }
  return trades;
}

// ── Signal: Simple Mean Reversion ────────────────────────
function simpleMeanReversion(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
  if (candles.length < 31) return [];
  const trades: BacktestTrade[] = [];
  let entryIdx = -1;
  let entryPrice = 0;
  let entrySide: 'buy' | 'sell' = 'buy';
  for (let i = 30; i < candles.length; i++) {
    const s30 = sma(candles, i, 30);
    const atr30 = atr(candles, i, 30);
    const price = candles[i].close;
    if (entryIdx === -1) {
      if (price < s30 - 1.5 * atr30) {
        entryIdx = i; entryPrice = price * (1 + cfg.slipPct); entrySide = 'buy';
      } else if (price > s30 + 1.5 * atr30) {
        entryIdx = i; entryPrice = price * (1 - cfg.slipPct); entrySide = 'sell';
      }
    } else {
      const crossed = entrySide === 'buy' ? price >= s30 : price <= s30;
      if (crossed) {
        const exit = entrySide === 'buy' ? price * (1 - cfg.slipPct) : price * (1 + cfg.slipPct);
        const fee = Math.abs(entryPrice + exit) * cfg.feePct;
        trades.push(makeTrade(candles[entryIdx].timestamp, candles[i].timestamp, entrySide, entryPrice, exit, fee));
        entryIdx = -1;
      }
    }
  }
  return trades;
}

// ── Main entry ────────────────────────────────────────────
export function runBaseline(candles: Candle[], config: BaselineConfig): EvaluationReport {
  if (candles.length < 2) return emptyReport(config);
  const cfg = costConfig(config.stressMode, config.feePct, config.slipPct);
  let trades: BacktestTrade[];
  switch (config.strategy) {
    case 'buy_hold': trades = buyAndHold(candles, cfg); break;
    case 'random_entry': trades = randomEntry(candles, cfg, 42); break;
    case 'simple_momentum': trades = simpleMomentum(candles, cfg); break;
    case 'simple_mean_reversion': trades = simpleMeanReversion(candles, cfg); break;
  }
  const totalFees = trades.reduce((s, t) => s + t.fee, 0);
  return buildReport(trades, config, totalFees);
}
