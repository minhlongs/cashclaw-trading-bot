import type { EquityCurvePoint } from './equity-curve-chart';
import type { BacktestTradeItem } from './recent-trades-table';

export interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  configJson: string;
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
  equity_curve_json: EquityCurvePoint[];
  trades_json: BacktestTradeItem[];
  created_at: number;
}

export const INTERVALS = ['1h', '4h', '1d'] as const;
