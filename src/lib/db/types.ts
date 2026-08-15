// Core Cloudflare runtime types (inlined to avoid @cloudflare/workers-types dependency)

export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' | 'boolean' | unknown }): Promise<string | null | undefined>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(options?: { json?: boolean }): Promise<T | null>;
  firstRow<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; meta: { duration: number } }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number; duration: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<string>;
}

export interface Env {
  DB: D1Database;
  CACHE?: KVNamespace;
}

// Application domain types

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
  killswitch_enabled: number;
  killswitch_reason: string | null;
  killswitch_triggered_at: number | null;
  updated_at: number;
}

export interface Bot {
  id: string;
  user_id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
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

export interface Trade {
  id: string;
  bot_id: string;
  pair: string;
  side: 'buy' | 'sell';
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  fee: number;
  status: 'open' | 'filled' | 'cancelled' | 'failed';
  exchange_order_id: string | null;
  error_message: string | null;
  opened_at: number;
  closed_at: number | null;
  created_at: number;
}

export interface ApiCredential {
  id: string;
  user_id: string;
  exchange: string;
  api_key_encrypted: string;
  api_secret_encrypted: string;
  is_testnet: number;
  created_at: number;
  updated_at: number;
}

// Telemetry events
export interface TradeEvent {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string;
  created_at: number;
}

// Capital snapshots
export interface CapitalSnapshot {
  id: string;
  bot_id: string;
  total_capital: number;
  realized_pnl: number;
  unrealized_pnl: number;
  max_drawdown_pct: number;
  win_count: number;
  loss_count: number;
  total_trades: number;
  created_at: number;
}

// Audit log
export interface AuditLog {
  id: string;
  user_id: string | null;
  bot_id: string | null;
  action: string;
  detail_json: string;
  created_at: number;
}

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
