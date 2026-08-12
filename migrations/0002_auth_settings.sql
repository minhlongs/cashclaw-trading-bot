-- Migration: 0002 — Auth, sessions, and settings tables

-- Passcode hash column for email+passcode auth
ALTER TABLE users ADD COLUMN passcode_hash TEXT;

-- Sessions table for cookie-based auth
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- User settings: exchange credentials, risk limits, killswitch
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  exchange_creds_json TEXT DEFAULT '{}',
  risk_limits_json TEXT DEFAULT '{}',
  killswitch_enabled INTEGER DEFAULT 1,
  killswitch_reason TEXT,
  killswitch_triggered_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
