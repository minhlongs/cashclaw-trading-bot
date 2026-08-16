-- Migration: 0008 — Circuit breaker state persistence
-- Enables circuit breaker to survive CF Workers cold starts

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'closed' CHECK(state IN ('closed', 'degraded', 'open', 'half_open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cb_state_provider ON circuit_breaker_state(provider);
