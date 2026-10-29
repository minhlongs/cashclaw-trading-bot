-- Add compare-and-swap versions and database-enforced immutable status history.
ALTER TABLE ops_work_items ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE ops_work_item_events ADD COLUMN item_version INTEGER CHECK (item_version IS NULL OR item_version >= 0);

-- Preserve version/history consistency for records written under migration 0014.
UPDATE ops_work_item_events AS event
SET item_version = CASE
  WHEN event.action = 'created' THEN 0
  ELSE (
    SELECT COUNT(*)
    FROM ops_work_item_events AS prior
    WHERE prior.item_id = event.item_id
      AND prior.action = 'status_changed'
      AND (prior.created_at < event.created_at OR (prior.created_at = event.created_at AND prior.id <= event.id))
  )
END;
UPDATE ops_work_items AS item
SET version = (
  SELECT COUNT(*) FROM ops_work_item_events AS event
  WHERE event.item_id = item.id AND event.action = 'status_changed'
);

CREATE INDEX IF NOT EXISTS idx_ops_events_owner_item_version
  ON ops_work_item_events(owner_user_id, item_id, item_version, created_at, id);

CREATE TRIGGER IF NOT EXISTS ops_work_item_status_event
AFTER UPDATE OF status ON ops_work_items
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO ops_work_item_events
    (id, item_id, owner_user_id, action, from_status, to_status, created_at, item_version)
  VALUES
    (lower(hex(randomblob(16))), NEW.id, NEW.owner_user_id, 'status_changed', OLD.status, NEW.status, NEW.updated_at, NEW.version);
END;

CREATE TRIGGER IF NOT EXISTS ops_work_item_events_no_update
BEFORE UPDATE ON ops_work_item_events
BEGIN
  SELECT RAISE(ABORT, 'operations event log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS ops_work_item_events_no_delete
BEFORE DELETE ON ops_work_item_events
BEGIN
  SELECT RAISE(ABORT, 'operations event log is append-only');
END;
