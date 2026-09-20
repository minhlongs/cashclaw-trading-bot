/**
 * D1 Database Schema — Auxiliary & Audit Table DDL Definitions
 */

// Audit Log
export const CREATE_AUDIT_LOG = `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  bot_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at INTEGER NOT NULL
)`;

// Hash-chained audit ledger (Vibe-Trading pattern)
export const CREATE_AUDIT_LEDGER = `
CREATE TABLE IF NOT EXISTS audit_ledger (
  id TEXT PRIMARY KEY,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  bot_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
)`;

// Backtest Results
export const CREATE_BACKTEST_RESULTS = `
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  bot_id TEXT,
  strategy TEXT NOT NULL,
  pair TEXT NOT NULL,
  exchange TEXT NOT NULL,
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  total_trades INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  win_rate REAL DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  sharpe_ratio REAL,
  params_json TEXT,
  equity_curve_json TEXT,
  trades_json TEXT,
  created_at INTEGER NOT NULL
)`;

// Circuit Breaker State (provider health persistence across CF Worker restarts)
export const CREATE_CIRCUIT_BREAKER = `
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER,
  updated_at INTEGER NOT NULL
)`;
