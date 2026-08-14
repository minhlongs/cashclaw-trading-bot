// Backtest Engine — deterministic simulation over OHLCV candles
// Strategy classes emit fills via their callbacks; we record them and compute metrics.

import type { BotConfig, GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import type { Ticker } from '@/tree/exchange/types';
import { GridStrategy } from '@/tree/bot/strategies/grid';
import { MeanRevStrategy } from '@/tree/bot/strategies/mean-reversion';
import type { BacktestResult, RunBacktestOptions } from './types';
import { PaperExchange } from './paper-exchange';
import { buildTradesFromFills, buildEquity, computeSharpe } from './metrics';

// Re-export all public types
export type { BacktestTrade, BacktestEquityPoint, BacktestResult, RunBacktestOptions } from './types';

// ──────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────

/**
 * Run a deterministic backtest over historical OHLCV candles.
 * Strategy callbacks bridge order requests to the PaperExchange adapter;
 * fills are accumulated then converted to trades and equity curve post-run.
 */
export function runBacktest(opts: RunBacktestOptions): BacktestResult {
  const { config, candles, feePct = 0.1, slippagePct = 0.05, initialCapital, botId } = opts;
  const capital = initialCapital ?? config.capital;

  if (candles.length < 2) throw new Error(`Not enough candles: ${candles.length}`);

  const paper = new PaperExchange(capital, feePct, slippagePct);

  // Run strategy over each candle
  let strategy: GridStrategy | MeanRevStrategy;
  if (config.strategy === 'grid') {
    strategy = new GridStrategy(config as GridBotConfig, paper);
    strategy.start(candles[0].close);
  } else {
    strategy = new MeanRevStrategy(config as MeanRevBotConfig, paper);
  }

  for (let i = 0; i < candles.length; i++) {
    paper.setTimestamp(candles[i].timestamp);
    const t: Ticker = {
      symbol: config.symbol,
      last: candles[i].close,
      bid: candles[i].close,
      ask: candles[i].close,
      high24h: candles[i].high,
      low24h: candles[i].low,
      volume24h: candles[i].volume,
      timestamp: candles[i].timestamp,
    };
    strategy.onTicker(t);
  }

  // Build trades from fills
  const trades = buildTradesFromFills(paper.fills, feePct, capital);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const equityCurve = buildEquity(capital, candles, trades);
  const maxDrawdown = equityCurve.length ? Math.max(...equityCurve.map((e) => e.drawdownPct)) : 0;
  const sharpe = computeSharpe(equityCurve);

  const id = `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    bot_id: botId,
    strategy: config.strategy,
    pair: config.symbol,
    exchange: config.exchange,
    start_date: candles[0].timestamp,
    end_date: candles[candles.length - 1].timestamp,
    total_trades: trades.length,
    win_count: wins.length,
    loss_count: losses.length,
    win_rate: Number(winRate.toFixed(4)),
    total_pnl: Number(totalPnl.toFixed(2)),
    max_drawdown: Number(maxDrawdown.toFixed(2)),
    sharpe_ratio: Number(sharpe.toFixed(4)) || null,
    params_json: JSON.stringify(config),
    equity_curve_json: equityCurve,
    trades_json: trades,
    created_at: Date.now(),
  };
}
