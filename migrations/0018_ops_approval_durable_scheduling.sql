-- Migration 0018: approved-execution Operations actions + durable scheduling/alert dispatch state.
-- Owner decision (2026-10-30): the five-department queue runs at "approved execution" level —
-- agents/operators prepare drafts, a human approves each action (or a batch) before any external
-- side effect. This migration adds the approval lifecycle columns, an append-only approval/execution
-- audit whose INSERT trigger performs the state transition as ONE SQLite statement (CAS-guarded on
-- the previous state and optimistic version — the 0017 pattern), plus durable tables for cross-
-- isolate bot tick leases and alert dispatch dedup/retry. Existing plain work items are untouched:
-- approval_state stays 'none' and no behavior changes for them.

ALTER TABLE ops_work_items ADD COLUMN action_type TEXT;
ALTER TABLE ops_work_items ADD COLUMN action_payload_json TEXT;
ALTER TABLE ops_work_items ADD COLUMN approval_state TEXT NOT NULL DEFAULT 'none';
ALTER TABLE ops_work_items ADD COLUMN submitted_at_ms INTEGER;
ALTER TABLE ops_work_items ADD COLUMN approved_by TEXT;
ALTER TABLE ops_work_items ADD COLUMN approved_at_ms INTEGER;
ALTER TABLE ops_work_items ADD COLUMN decision_reason TEXT;
ALTER TABLE ops_work_items ADD COLUMN execution_state TEXT;
ALTER TABLE ops_work_items ADD COLUMN executed_at_ms INTEGER;
ALTER TABLE ops_work_items ADD COLUMN execution_result TEXT;

-- Append-only audit for approval and execution transitions. Presence of a row = a completed
-- transition (the row IS the transition). The apply trigger below mutates the work item inside
-- this INSERT, so an audit row can never exist without its state change and vice versa.
CREATE TABLE IF NOT EXISTS ops_approval_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  item_version INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_approval_events_item
  ON ops_approval_events(item_id, created_at_ms DESC);

CREATE TRIGGER IF NOT EXISTS ops_approval_events_no_update
BEFORE UPDATE ON ops_approval_events
BEGIN
  SELECT RAISE(ABORT, 'ops approval events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS ops_approval_events_no_delete
BEFORE DELETE ON ops_approval_events
BEGIN
  SELECT RAISE(ABORT, 'ops approval events are append-only');
END;

-- Compare-and-swap guard: the audit INSERT is refused unless the item is still in the verified
-- prior state (approval/execution state + optimistic version). This runs BEFORE the insert so a
-- stale transition describing an already-completed change can never be recorded as new.
CREATE TRIGGER IF NOT EXISTS ops_approval_events_guard
BEFORE INSERT ON ops_approval_events
BEGIN
  SELECT RAISE(ABORT, 'approval transition did not land exactly one row')
  WHERE NOT EXISTS (
    SELECT 1 FROM ops_work_items
    WHERE id = NEW.item_id
      AND owner_user_id = NEW.owner_user_id
      AND version = NEW.item_version
      AND action_type IS NOT NULL
      AND (
        CASE
          WHEN NEW.to_state IN ('executed', 'failed')
            THEN (approval_state = 'approved' AND (execution_state IS NULL OR execution_state = 'failed'))
          ELSE (approval_state = NEW.from_state AND approval_state <> 'none')
        END
      )
  );
END;

-- Compare-and-swap apply: the audit INSERT performs the transition only when the item is still in
-- the verified prior state (approval/execution state + optimistic version). Anything else aborts
-- the whole statement, so a stale or concurrent transition can never overwrite a newer state and
-- can never leave an audit row behind. Executed/failed events target execution_state (approval
-- stays 'approved'); all other events target approval_state.
CREATE TRIGGER IF NOT EXISTS ops_approval_events_apply
AFTER INSERT ON ops_approval_events
BEGIN
  UPDATE ops_work_items
  SET approval_state = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN approval_state ELSE NEW.to_state END,
      submitted_at_ms = CASE WHEN NEW.to_state = 'pending_approval' THEN NEW.created_at_ms ELSE submitted_at_ms END,
      approved_by = CASE WHEN NEW.to_state = 'approved' THEN NEW.actor ELSE approved_by END,
      approved_at_ms = CASE WHEN NEW.to_state = 'approved' THEN NEW.created_at_ms ELSE approved_at_ms END,
      decision_reason = CASE WHEN NEW.to_state = 'rejected' THEN NEW.reason ELSE decision_reason END,
      execution_state = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.to_state ELSE execution_state END,
      executed_at_ms = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.created_at_ms ELSE executed_at_ms END,
      execution_result = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.reason ELSE execution_result END,
      updated_at = NEW.created_at_ms,
      version = version + 1
  WHERE id = NEW.item_id
    AND owner_user_id = NEW.owner_user_id
    AND version = NEW.item_version
    AND action_type IS NOT NULL
    AND (
      CASE
        WHEN NEW.to_state IN ('executed', 'failed')
          THEN (approval_state = 'approved' AND (execution_state IS NULL OR execution_state = 'failed'))
        ELSE (approval_state = NEW.from_state AND approval_state <> 'none')
      END
    );
  SELECT RAISE(ABORT, 'approval transition did not land exactly one row')
  WHERE (SELECT COUNT(*) FROM ops_work_items
         WHERE id = NEW.item_id
           AND owner_user_id = NEW.owner_user_id
           AND version = NEW.item_version + 1
           AND action_type IS NOT NULL
           AND (
             CASE
               WHEN NEW.to_state IN ('executed', 'failed')
                 THEN (approval_state = 'approved' AND execution_state = NEW.to_state)
               ELSE (approval_state = NEW.to_state)
             END
           )) <> 1;
END;

-- Durable bot tick leases: one lease per workspace/bot/minute across all worker isolates.
-- Acquire = INSERT (PK conflict = already leased this minute); takeover of an EXPIRED lease is a
-- guarded UPDATE requiring exactly one changed row.
CREATE TABLE IF NOT EXISTS saas_bot_tick_leases (
  workspace_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  epoch_minute INTEGER NOT NULL,
  isolate_id TEXT NOT NULL,
  acquired_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, bot_id, epoch_minute)
);

CREATE INDEX IF NOT EXISTS idx_saas_bot_tick_leases_expiry
  ON saas_bot_tick_leases(expires_at_ms);

-- Durable alert dispatch log: dedup by event_id and retry state across isolates.
-- status: pending (claimed/in flight) | sent | failed (retryable) | suppressed.
CREATE TABLE IF NOT EXISTS saas_alert_dispatch_log (
  event_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_ref TEXT,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_alert_dispatch_log_scope
  ON saas_alert_dispatch_log(workspace_id, created_at_ms DESC);
