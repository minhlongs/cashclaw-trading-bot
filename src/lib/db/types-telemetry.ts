// Telemetry entity types — trades, credentials, trade events, capital snapshots, audit logs

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
