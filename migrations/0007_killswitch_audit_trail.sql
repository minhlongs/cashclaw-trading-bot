-- Migration: 0007 — Killswitch authenticated audit trail
CREATE TABLE IF NOT EXISTS killswitch_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('halt','resume')),
  user_id TEXT,
  reason TEXT NOT NULL,
  bot_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_killswitch_events_created_at ON killswitch_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_killswitch_events_user ON killswitch_events(user_id);