// Backtest Engine — public types
// Shared interfaces for the backtest module.

import type { BotConfig } from '@/tree/bot/types';
import type { Candle } from './ohlcv';

// ──────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────

export interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fee: number;
  pnlPct: number;
  holdingMinutes: number;
  exitReason?: string;
  entryRegime?: string;
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
}

export interface BacktestResult {
  id: string;
  bot_id: string;
  strategy: string;
  pair: string;
  exchange: string;
  start_date: number;
  end_date: number;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl: number;
  max_drawdown: number;
  sharpe_ratio: number | null;
  params_json: string;
  equity_curve_json: BacktestEquityPoint[];
  trades_json: BacktestTrade[];
  created_at: number;
}

export interface RunBacktestOptions {
  config: BotConfig;
  candles: Candle[];
  feePct?: number;
  slippagePct?: number;
  initialCapital?: number;
  botId: string;
}
