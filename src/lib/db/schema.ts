/**
 * D1 Database Schema
 * Run via: npx wrangler d1 migrations apply cashclaw-db --local
 */

export const SQL = {
// Users
CREATE_USERS: `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  locale TEXT DEFAULT 'vi',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
`,

// Bots
CREATE_BOTS: `
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('grid', 'mean_reversion')),
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
)
`,

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
)
`,

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
)
`,

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
)
`,
CREATE_INDEX_EVENTS_BOT_TIME: `CREATE INDEX IF NOT EXISTS idx_events_bot_time ON trade_events(bot_id, created_at)`,

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
)
`,
CREATE_INDEX_SNAPSHOTS_BOT: `CREATE INDEX IF NOT EXISTS idx_snapshots_bot ON capital_snapshots(bot_id, created_at)`,

// Audit Log
CREATE_AUDIT_LOG: `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  bot_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at INTEGER NOT NULL
)
`,
CREATE_INDEX_USER_AUDIT: `CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at)`,
CREATE_INDEX_BOT_AUDIT: `CREATE INDEX IF NOT EXISTS idx_audit_bot ON audit_log(bot_id, created_at)`,

// Hash-chained audit ledger (Vibe-Trading pattern)
CREATE_AUDIT_LEDGER: `
CREATE TABLE IF NOT EXISTS audit_ledger (
  id TEXT PRIMARY KEY,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  bot_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
)
`,
CREATE_INDEX_AUDIT_LEDGER_CREATED: `CREATE INDEX IF NOT EXISTS idx_audit_ledger_created ON audit_ledger(created_at)`,
CREATE_INDEX_BOT_USER: `CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id)`,
CREATE_INDEX_TRADES_BOT: `CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot_id, opened_at)`,

// Backtest Results
CREATE_BACKTEST_RESULTS: `
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
)
`,
CREATE_INDEX_BACKTEST_BOT: `CREATE INDEX IF NOT EXISTS idx_backtest_bot ON backtest_results(bot_id, created_at)`,

// Circuit Breaker State (provider health persistence across CF Worker restarts)
CREATE_CIRCUIT_BREAKER: `
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER,
  updated_at INTEGER NOT NULL
)
`,
};

export const MIGRATION = `
${SQL.CREATE_USERS};
${SQL.CREATE_BOTS};
${SQL.CREATE_TRADES};
${SQL.CREATE_CREDENTIALS};
${SQL.CREATE_TRADE_EVENTS};
${SQL.CREATE_CAPITAL_SNAPSHOTS};
${SQL.CREATE_AUDIT_LOG};
${SQL.CREATE_AUDIT_LEDGER};
${SQL.CREATE_INDEX_AUDIT_LEDGER_CREATED};
${SQL.CREATE_BACKTEST_RESULTS};
${SQL.CREATE_INDEX_USER_AUDIT};
${SQL.CREATE_INDEX_BOT_AUDIT};
${SQL.CREATE_INDEX_BOT_USER};
${SQL.CREATE_INDEX_TRADES_BOT};
${SQL.CREATE_INDEX_EVENTS_BOT_TIME};
${SQL.CREATE_INDEX_SNAPSHOTS_BOT};
${SQL.CREATE_INDEX_BACKTEST_BOT};
${SQL.CREATE_CIRCUIT_BREAKER};
`;
