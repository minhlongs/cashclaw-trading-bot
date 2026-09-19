// Application domain entity types — users, settings, bots

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  locale: string;
  created_at: number;
  updated_at: number;
}

export interface SettingsRow {
  id: string;
  user_id: string | null;
  exchange_creds_json: string;
  risk_limits_json: string;
  notification_json: string;
  killswitch_daily_json: string;
  killswitch_enabled: number;
  killswitch_reason: string | null;
  killswitch_triggered_at: number | null;
  updated_at: number;
}

export interface Bot {
  id: string;
  user_id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion' | 'volatility_dca';
  pair: string;
  exchange: 'binance' | 'bybit' | 'okx';
  status: 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';
  config_json: string;
  capital_allocated: number;
  capital_used: number;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  total_trades: number;
  started_at: number | null;
  stopped_at: number | null;
  last_error: string | null;
  last_tick_at: number | null;
  last_order_at: number | null;
  current_drawdown: number;
  created_at: number;
  updated_at: number;
}
