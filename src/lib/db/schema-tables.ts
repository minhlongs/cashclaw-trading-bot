/**
 * D1 Database Schema — Table DDL Definitions
 */

import {
  CREATE_AUDIT_LOG,
  CREATE_AUDIT_LEDGER,
  CREATE_BACKTEST_RESULTS,
  CREATE_CIRCUIT_BREAKER,
} from './schema-tables-aux';

export const SQL_TABLES = {
  // Users
  CREATE_USERS: `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  locale TEXT DEFAULT 'vi',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  // Bots
  CREATE_BOTS: `
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('grid', 'mean_reversion', 'volatility_dca')),
  pair TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'bybit', 'okx')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paper_test', 'live_running', 'paused', 'error', 'stopped')),
  config_json TEXT NOT NULL,
  capital_allocated REAL NOT NULL,
  capital_used REAL DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  // Trades
  CREATE_TRADES: `
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  quantity REAL NOT NULL,
  pnl REAL,
  fee REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'failed')),
  exchange_order_id TEXT,
  error_message TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  created_at INTEGER NOT NULL
)`,
  // API Credentials (encrypted)
  CREATE_CREDENTIALS: `
CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  is_testnet INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  // Trade Events (telemetry — tick, fill, signal, error, halt, snapshot)
  CREATE_TRADE_EVENTS: `
CREATE TABLE IF NOT EXISTS trade_events (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'tick', 'fill', 'signal', 'error', 'halt', 'resume',
      'start', 'stop', 'pause', 'config_change', 'rebalance', 'metric_snapshot'
    )
  ),
  detail_json TEXT,
  created_at INTEGER NOT NULL
)`,
  // Daily capital snapshots (govern when to go live)
  CREATE_CAPITAL_SNAPSHOTS: `
CREATE TABLE IF NOT EXISTS capital_snapshots (
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
)`,
  CREATE_AUDIT_LOG,
  CREATE_AUDIT_LEDGER,
  CREATE_BACKTEST_RESULTS,
  CREATE_CIRCUIT_BREAKER,
};
