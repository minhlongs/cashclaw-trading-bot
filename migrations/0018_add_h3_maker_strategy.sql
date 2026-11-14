-- Migration 0018: Expand bots.strategy CHECK to include 'h3_maker'
-- SQLite requires table recreation to alter CHECK constraints.

PRAGMA foreign_keys=OFF;

CREATE TABLE bots_dg_tmp (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('grid', 'mean_reversion', 'volatility_dca', 'h3_maker')),
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
  total_trades INTEGER DEFAULT 0,
  started_at INTEGER,
  stopped_at INTEGER,
  last_error TEXT,
  last_tick_at INTEGER,
  last_order_at INTEGER,
  current_drawdown REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO bots_dg_tmp (
  id, user_id, name, strategy, pair, exchange, status, config_json,
  capital_allocated, capital_used, total_pnl, win_count, loss_count,
  max_drawdown, total_trades, started_at, stopped_at, last_error,
  last_tick_at, last_order_at, current_drawdown, created_at, updated_at
)
SELECT
  id, user_id, name, strategy, pair, exchange, status, config_json,
  capital_allocated, capital_used, total_pnl, win_count, loss_count,
  max_drawdown, total_trades, started_at, stopped_at, last_error,
  last_tick_at, last_order_at, current_drawdown, created_at, updated_at
FROM bots;

DROP TABLE bots;
ALTER TABLE bots_dg_tmp RENAME TO bots;

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);

PRAGMA foreign_keys=ON;
