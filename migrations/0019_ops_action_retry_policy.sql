-- Migration 0019: per-message retry policy, immutable approved snapshots, execution attempt log,
-- and approval revocation. Owner decision (2026-11-02): after approval, the agent may auto-send
-- outbound_message and retry WITHIN the approved limits; duplicate messages are accepted. This
-- migration separates the three concerns that 0018 compressed:
--   1. Approval lifecycle  — approval_state (none|draft|pending_approval|approved|rejected|revoked)
--   2. Execution attempts  — ops_action_attempts rows (claim = atomic attempt consumption)
--   3. Delivery outcome    — attempts.outcome + execution_state summary (provider_accepted only)
-- Retry policy values (defaults chosen by the agent for the TEST environment, NOT owner-approved
-- production limits): max_attempts 3 (cap 10), request_timeout_ms 10000 (100..60000),
-- backoff_base_ms 1000, backoff_max_ms 60000, approval_ttl_ms 24h (60s..7d). Missing/invalid
-- policy blocks execution (fail closed). Approval binds to a SHA-256 snapshot of action type,
-- payload, resolved target descriptor and policy; any change after approval requires re-approval.

ALTER TABLE ops_work_items ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ops_work_items ADD COLUMN request_timeout_ms INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE ops_work_items ADD COLUMN backoff_base_ms INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE ops_work_items ADD COLUMN backoff_max_ms INTEGER NOT NULL DEFAULT 60000;
ALTER TABLE ops_work_items ADD COLUMN approval_ttl_ms INTEGER NOT NULL DEFAULT 86400000;
ALTER TABLE ops_work_items ADD COLUMN approval_expires_at_ms INTEGER;
ALTER TABLE ops_work_items ADD COLUMN approved_sha256 TEXT;
ALTER TABLE ops_work_items ADD COLUMN approved_target TEXT;
ALTER TABLE ops_work_items ADD COLUMN next_attempt_at_ms INTEGER;
ALTER TABLE ops_work_items ADD COLUMN revoked_at_ms INTEGER;

-- Approved snapshot carried by the approval event so the audit INSERT remains the single atomic
-- transition (0018 pattern). The apply trigger copies it onto the item for 'approved' events.
ALTER TABLE ops_approval_events ADD COLUMN approved_sha256 TEXT;
ALTER TABLE ops_approval_events ADD COLUMN approved_target TEXT;

-- Execution attempts: a row is INSERTed (claimed) BEFORE any external side effect, so a crashed
-- process can never lose a consumed attempt. UNIQUE(item_id, attempt_no) is the atomic claim:
-- two workers racing for the same attempt number produce exactly one winner. Only the outcome
-- columns may change, and only once (in_flight -> result).
CREATE TABLE IF NOT EXISTS ops_action_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  claimed_by TEXT NOT NULL,
  claimed_at_ms INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  scheduled_for_ms INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'in_flight'
    CHECK (outcome IN ('in_flight', 'provider_accepted', 'failed_retryable', 'failed_terminal', 'unknown', 'discarded')),
  outcome_detail TEXT,
  provider_ref TEXT,
  http_status INTEGER,
  finished_at_ms INTEGER,
  UNIQUE (item_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_ops_action_attempts_item
  ON ops_action_attempts(item_id, attempt_no DESC);

-- Attempt rows are claim-immutable: the claim identity (item, number, claimer, timing) never
-- changes and an outcome can only transition out of 'in_flight' exactly once. Attempts are never
-- deleted (retention excludes them) so restarts cannot reset the counter or erase history.
CREATE TRIGGER IF NOT EXISTS ops_action_attempts_no_claim_tamper
BEFORE UPDATE ON ops_action_attempts
BEGIN
  SELECT RAISE(ABORT, 'attempt claim is immutable')
  WHERE NEW.id <> OLD.id
     OR NEW.item_id <> OLD.item_id
     OR NEW.owner_user_id <> OLD.owner_user_id
     OR NEW.attempt_no <> OLD.attempt_no
     OR NEW.claimed_by <> OLD.claimed_by
     OR NEW.claimed_at_ms <> OLD.claimed_at_ms
     OR OLD.outcome <> 'in_flight';
END;

CREATE TRIGGER IF NOT EXISTS ops_action_attempts_no_delete
BEFORE DELETE ON ops_action_attempts
BEGIN
  SELECT RAISE(ABORT, 'attempt history is append-only');
END;

-- Replace the 0018 approval triggers with extended versions. 0018 itself is left byte-identical
-- (it is already applied in verification environments); the replacement happens here, in order.
DROP TRIGGER IF EXISTS ops_approval_events_guard;
DROP TRIGGER IF EXISTS ops_approval_events_apply;

-- Guard: refuse the audit INSERT unless the item is in the verified prior state. For 'approved'
-- events the snapshot hash and target are mandatory. Revoke is only valid from 'approved'.
CREATE TRIGGER IF NOT EXISTS ops_approval_events_guard
BEFORE INSERT ON ops_approval_events
BEGIN
  SELECT RAISE(ABORT, 'approval transition did not land exactly one row')
  WHERE NOT EXISTS (
    SELECT 1 FROM ops_work_items
    WHERE id = NEW.item_id
      AND owner_user_id = NEW.owner_user_id
      AND version = NEW.item_version
      AND (
        CASE
          WHEN NEW.to_state IN ('executed', 'failed')
            THEN (action_type IS NOT NULL
                  AND approval_state = 'approved'
                  AND revoked_at_ms IS NULL
                  AND approved_sha256 IS NOT NULL
                  AND approved_target IS NOT NULL
                  AND (execution_state IS NULL OR execution_state = 'failed'))
          WHEN NEW.to_state = 'approved'
            THEN (action_type IS NOT NULL
                  AND approval_state = NEW.from_state
                  AND approval_state = 'pending_approval'
                  AND NEW.approved_sha256 IS NOT NULL
                  AND NEW.approved_target IS NOT NULL)
          WHEN NEW.to_state = 'revoked'
            THEN (action_type IS NOT NULL
                  AND approval_state = NEW.from_state
                  AND approval_state = 'approved')
          ELSE (action_type IS NOT NULL
                AND approval_state = NEW.from_state
                AND approval_state <> 'none')
        END
      )
  );
END;

-- Apply: the audit INSERT performs the transition atomically (CAS on prior state + optimistic
-- version) and stamps the immutable approved snapshot. A post-state check aborts the whole
-- statement unless exactly one row landed in the expected state.
CREATE TRIGGER IF NOT EXISTS ops_approval_events_apply
AFTER INSERT ON ops_approval_events
BEGIN
  UPDATE ops_work_items
  SET approval_state = CASE
        WHEN NEW.to_state IN ('executed', 'failed') THEN approval_state
        ELSE NEW.to_state
      END,
      submitted_at_ms = CASE WHEN NEW.to_state = 'pending_approval' THEN NEW.created_at_ms ELSE submitted_at_ms END,
      approved_by = CASE WHEN NEW.to_state = 'approved' THEN NEW.actor ELSE approved_by END,
      approved_at_ms = CASE WHEN NEW.to_state = 'approved' THEN NEW.created_at_ms ELSE approved_at_ms END,
      approved_sha256 = CASE WHEN NEW.to_state = 'approved' THEN NEW.approved_sha256 ELSE approved_sha256 END,
      approved_target = CASE WHEN NEW.to_state = 'approved' THEN NEW.approved_target ELSE approved_target END,
      approval_expires_at_ms = CASE
        WHEN NEW.to_state = 'approved' THEN NEW.created_at_ms + approval_ttl_ms
        ELSE approval_expires_at_ms
      END,
      decision_reason = CASE WHEN NEW.to_state = 'rejected' THEN NEW.reason ELSE decision_reason END,
      revoked_at_ms = CASE WHEN NEW.to_state = 'revoked' THEN NEW.created_at_ms ELSE revoked_at_ms END,
      execution_state = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.to_state ELSE execution_state END,
      executed_at_ms = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.created_at_ms ELSE executed_at_ms END,
      execution_result = CASE WHEN NEW.to_state IN ('executed', 'failed') THEN NEW.reason ELSE execution_result END,
      updated_at = NEW.created_at_ms,
      version = version + 1
  WHERE id = NEW.item_id
    AND owner_user_id = NEW.owner_user_id
    AND version = NEW.item_version
    AND (
      CASE
        WHEN NEW.to_state IN ('executed', 'failed')
          THEN (approval_state = 'approved' AND revoked_at_ms IS NULL
                AND approved_sha256 IS NOT NULL AND approved_target IS NOT NULL
                AND (execution_state IS NULL OR execution_state = 'failed'))
        WHEN NEW.to_state = 'approved'
          THEN (approval_state = 'pending_approval')
        WHEN NEW.to_state = 'revoked'
          THEN (approval_state = 'approved')
        ELSE (approval_state = NEW.from_state AND approval_state <> 'none')
      END
    );
  SELECT RAISE(ABORT, 'approval transition did not land exactly one row')
  WHERE (SELECT COUNT(*) FROM ops_work_items
         WHERE id = NEW.item_id
           AND owner_user_id = NEW.owner_user_id
           AND version = NEW.item_version + 1
           AND (
             CASE
               WHEN NEW.to_state IN ('executed', 'failed')
                 THEN (approval_state = 'approved' AND execution_state = NEW.to_state)
               WHEN NEW.to_state = 'approved'
                 THEN (approval_state = 'approved' AND approved_sha256 = NEW.approved_sha256)
               WHEN NEW.to_state = 'revoked'
                 THEN (approval_state = 'revoked' AND revoked_at_ms IS NOT NULL)
               ELSE (approval_state = NEW.to_state)
             END
           )) <> 1;
END;
