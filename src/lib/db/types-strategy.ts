// Strategy & backtest types — grid/mean-reversion configs, parsed strategy state, backtest results

// Strategy configs (stored as JSON in bots.config_json)
export interface GridConfig {
  spacing_pct: number;
  levels: number;
  capital_per_level_pct: number;
  max_drawdown_pct: number;
}

export interface MeanRevConfig {
  bb_period: number;
  bb_std: number;
  rsi_period: number;
  rsi_buy: number;
  rsi_sell: number;
  volume_multiplier: number;
  max_drawdown_pct: number;
  position_size_pct: number;
}

export type StrategyConfig = GridConfig | MeanRevConfig;

// Parsed config result
export interface ParsedGridConfig extends GridConfig {
  _type: 'grid';
}

export interface ParsedMeanRevConfig extends MeanRevConfig {
  _type: 'mean_reversion';
}

export type ParsedStrategyConfig = ParsedGridConfig | ParsedMeanRevConfig;

// Backtest results
export interface BacktestResultRow {
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
  equity_curve_json: string;
  created_at: number;
}
