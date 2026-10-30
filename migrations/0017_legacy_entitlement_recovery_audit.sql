-- Migration: 0017 — Durable, append-only audit for case-by-case legacy entitlement recovery.
-- Owner policy (2026-10-30): legacy entitlements lacking proof stay revoked; restoration is
-- manual, case-by-case, evidence-bound and audited. This table records APPLIED recoveries only
-- (presence of a row = a completed restore). Rejected attempts never mutate any table.
-- Never store secrets, raw provider payloads, or signatures here: references and verified facts only.
--
-- Atomicity design: the entitlement mutation is performed by the AFTER INSERT trigger below, so the
-- audit row and the restore are one SQLite statement — a restore can never exist without its audit
-- row, and no wrapper/transport semantics are relied upon. The BEFORE INSERT guard enforces the
-- compare-and-swap: insertion aborts unless the entitlement is still in the exact prior state the
-- recovery verified (revoked, with matching prior expiry/payment), so concurrent or stale retries
-- cannot double-grant or overwrite a newer state. recovery_id is the primary key, so a duplicate
-- retry of the same case aborts outright (idempotent, never extends a term).

CREATE TABLE IF NOT EXISTS saas_entitlement_recovery_audit (
  recovery_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  term_basis TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  verified_payment_status TEXT NOT NULL,
  verified_amount REAL NOT NULL CHECK (verified_amount > 0),
  verified_currency TEXT NOT NULL,
  prior_revoked_at_ms INTEGER,
  prior_expires_at_ms INTEGER,
  prior_payment_id TEXT,
  restored_expires_at_ms INTEGER NOT NULL,
  restored_payment_id TEXT,
  applied_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_recovery_audit_workspace
  ON saas_entitlement_recovery_audit(workspace_id, applied_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_saas_recovery_audit_owner
  ON saas_entitlement_recovery_audit(owner_user_id, applied_at_ms DESC);

CREATE TRIGGER IF NOT EXISTS saas_entitlement_recovery_audit_no_update
BEFORE UPDATE ON saas_entitlement_recovery_audit
BEGIN
  SELECT RAISE(ABORT, 'entitlement recovery audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS saas_entitlement_recovery_audit_no_delete
BEFORE DELETE ON saas_entitlement_recovery_audit
BEGIN
  SELECT RAISE(ABORT, 'entitlement recovery audit is append-only');
END;

-- Compare-and-swap guard: only insert (and therefore only restore) when the entitlement is still
-- exactly in the verified pre-recovery state. NEW carries the verified snapshot for the comparison.
CREATE TRIGGER IF NOT EXISTS saas_entitlement_recovery_apply_guard
BEFORE INSERT ON saas_entitlement_recovery_audit
WHEN NOT EXISTS (
  SELECT 1 FROM saas_workspace_entitlements e
  WHERE e.workspace_id = NEW.workspace_id
    AND e.owner_user_id = NEW.owner_user_id
    AND e.tier = NEW.tier
    AND e.tier <> 'BASIC'
    AND e.revoked_at_ms IS NEW.prior_revoked_at_ms
    AND e.revoked_at_ms IS NOT NULL
    AND e.expires_at_ms IS NEW.prior_expires_at_ms
    AND e.current_payment_id IS NEW.prior_payment_id
)
BEGIN
  SELECT RAISE(ABORT, 'recovery CAS conflict: entitlement is not in the verified prior state');
END;

-- The restore itself. Runs inside the audit INSERT statement: same statement, same snapshot.
CREATE TRIGGER IF NOT EXISTS saas_entitlement_recovery_apply_restore
AFTER INSERT ON saas_entitlement_recovery_audit
BEGIN
  UPDATE saas_workspace_entitlements
  SET revoked_at_ms = NULL,
      expires_at_ms = NEW.restored_expires_at_ms,
      current_payment_id = NEW.restored_payment_id,
      updated_at_ms = NEW.applied_at_ms
  WHERE workspace_id = NEW.workspace_id
    AND owner_user_id = NEW.owner_user_id
    AND tier = NEW.tier
    AND revoked_at_ms IS NEW.prior_revoked_at_ms
    AND expires_at_ms IS NEW.prior_expires_at_ms
    AND current_payment_id IS NEW.prior_payment_id;
END;
