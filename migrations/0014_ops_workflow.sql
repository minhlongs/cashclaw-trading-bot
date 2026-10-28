-- Migration 0014: persistent internal operations workflow (owner-scoped).
-- Records are retained for auditability; events are append-only.
CREATE TABLE IF NOT EXISTS ops_work_items (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('finance', 'operations', 'marketing', 'sales', 'support')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  amount_minor INTEGER,
  due_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_work_items_owner_department
  ON ops_work_items(owner_user_id, department, updated_at DESC);
CREATE TABLE IF NOT EXISTS ops_work_item_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'status_changed')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_work_item_events_item
  ON ops_work_item_events(item_id, created_at DESC);
