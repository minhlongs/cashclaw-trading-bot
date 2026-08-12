-- Migration: 0001 — Initial schema
-- CashClaw Trading Bot Platform

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  locale TEXT DEFAULT 'vi',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Bots
CREATE TABLE bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK(strategy IN ('grid', 'mean_reversion')),
  pair TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK(exchange IN ('binance', 'bybit', 'okx')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'paper_test', 'live_running', 'paused', 'error', 'stopped')),
  config_json TEXT NOT NULL,
  capital_allocated REAL NOT NULL,
  capital_used REAL DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Trades
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  quantity REAL NOT NULL,
  pnl REAL,
  fee REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'filled', 'cancelled', 'failed')),
  exchange_order_id TEXT,
  error_message TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  created_at INTEGER NOT NULL
);

-- API Credentials (encrypted)
CREATE TABLE api_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  is_testnet INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Telemetry events
CREATE TABLE trade_events (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('tick', 'fill', 'signal', 'error', 'halt', 'resume', 'start', 'stop', 'pause', 'config_change', 'rebalance', 'metric_snapshot')),
  detail_json TEXT,
  created_at INTEGER NOT NULL
);

-- Capital snapshots
CREATE TABLE capital_snapshots (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  total_capital REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL DEFAULT 0,
  max_drawdown_pct REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Audit log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  bot_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_events_bot_time ON trade_events(bot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_bot ON capital_snapshots(bot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_bot ON audit_log(bot_id, created_at);
