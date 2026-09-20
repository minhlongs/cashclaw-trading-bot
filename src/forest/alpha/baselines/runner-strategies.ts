// Baseline strategy runner — deterministic strategy implementations
// Each strategy takes candles + cost config and returns BacktestTrades.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { CostConfig } from '@/forest/backtest/cost-model';
import { lcg, makeTrade, sma, atr } from './runner-helpers';

// ── Signal: Buy & Hold ───────────────────────────────────
export function buyAndHold(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
  if (candles.length < 2) return [];
  const entry = candles[0].close * (1 + cfg.slipPct);
  const exit = candles[candles.length - 1].close * (1 - cfg.slipPct);
  const fee = Math.abs(entry + exit) * cfg.feePct;
  return [makeTrade(candles[0].timestamp, candles[candles.length - 1].timestamp, 'buy', entry, exit, fee)];
}

// ── Signal: Random Entry ─────────────────────────────────
export function randomEntry(candles: Candle[], cfg: CostConfig, seed: number): BacktestTrade[] {
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

// ── Signal: Simple Momentum ──────────────────────────────
export function simpleMomentum(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
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
export function simpleMeanReversion(candles: Candle[], cfg: CostConfig): BacktestTrade[] {
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
