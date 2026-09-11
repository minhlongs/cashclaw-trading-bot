-- Migration 0012: Expand bots.strategy CHECK to include 'volatility_dca'
-- SQLite requires table recreation to alter CHECK constraints.

PRAGMA foreign_keys=OFF;

CREATE TABLE bots_dg_tmp (
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

INSERT INTO bots_dg_tmp SELECT * FROM bots;
DROP TABLE bots;
ALTER TABLE bots_dg_tmp RENAME TO bots;

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);

PRAGMA foreign_keys=ON;
