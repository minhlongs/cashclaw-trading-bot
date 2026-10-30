-- Migration: 0017 — Durable, append-only audit for case-by-case legacy entitlement recovery.
-- Owner policy (2026-10-30): legacy entitlements lacking proof stay revoked; restoration is
-- manual, case-by-case, evidence-bound and audited. This table records APPLIED recoveries only
-- (presence of a row = a completed restore). Rejected attempts never mutate any table.
-- Never store secrets, raw provider payloads, or signatures here: references and verified facts only.
-- "verified_*" columns record what was verified against LOCAL database records at apply time;
-- reconciliation against provider dashboards/records is operator attestation (term_basis,
-- evidence_refs_json) and is never automated provider verification.
--
-- Atomicity design: the entitlement mutation is performed by the AFTER INSERT trigger below, so the
-- audit row and the restore are one SQLite statement — a restore can never exist without its audit
-- row, and no wrapper/transport semantics are relied upon. The BEFORE INSERT guard re-verifies the
-- ENTIRE decision basis at mutation time and enforces the compare-and-swap: insertion aborts
-- unless the entitlement is still in the exact verified prior state (revoked, with matching prior
-- expiry/payment/tier) AND the owner identity, workspace, active OWNER membership and the matched
-- payment evidence (legacy IPN event or payment order) are all still present and unchanged. The
-- guard also refuses any restore whose term has already ended at apply time, so an expired
-- entitlement can never be turned into an active one. Concurrent or stale retries cannot
-- double-grant or overwrite a newer state. recovery_id is the primary key, so a duplicate retry of
-- the same case aborts outright (idempotent, never extends a term) and a reused id with a
-- different payload is detected as a conflict by the tool before it ever mutates.
-- The AFTER trigger re-checks the post-state and aborts (rolling back the whole statement,
-- audit row included) unless the restore landed exactly one row in the exact target state.

CREATE TABLE IF NOT EXISTS saas_entitlement_recovery_audit (
  recovery_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  term_basis TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('legacy-ipn', 'payment-order')),
  evidence_order_id TEXT,
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

-- Guard: re-verify the whole decision basis immediately before mutation and compare-and-swap on
-- every state field the decision depends on. NEW carries the verified snapshot for the comparison.
CREATE TRIGGER IF NOT EXISTS saas_entitlement_recovery_apply_guard
BEFORE INSERT ON saas_entitlement_recovery_audit
BEGIN
  -- 1. Entitlement is still exactly in the verified prior state (tier, revoked, expiry, payment).
  SELECT RAISE(ABORT, 'recovery CAS conflict: entitlement is not in the verified prior state')
  WHERE NOT EXISTS (
    SELECT 1 FROM saas_workspace_entitlements e
    WHERE e.workspace_id = NEW.workspace_id
      AND e.owner_user_id = NEW.owner_user_id
      AND e.tier = NEW.tier
      AND e.tier <> 'BASIC'
      AND e.revoked_at_ms IS NEW.prior_revoked_at_ms
      AND e.revoked_at_ms IS NOT NULL
      AND e.expires_at_ms IS NEW.prior_expires_at_ms
      AND e.current_payment_id IS NEW.prior_payment_id
  );
  -- 2. Owner identity row still exists.
  SELECT RAISE(ABORT, 'recovery CAS conflict: owner identity row missing')
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id);
  -- 3. Workspace still active and still owned by the same owner.
  SELECT RAISE(ABORT, 'recovery CAS conflict: workspace/owner binding changed')
  WHERE NOT EXISTS (
    SELECT 1 FROM saas_workspaces w
    WHERE w.workspace_id = NEW.workspace_id
      AND w.owner_user_id = NEW.owner_user_id
      AND w.status = 'active'
  );
  -- 4. Active, unexpired OWNER membership still present at apply time.
  SELECT RAISE(ABORT, 'recovery CAS conflict: OWNER membership changed')
  WHERE NOT EXISTS (
    SELECT 1 FROM saas_workspace_memberships m
    WHERE m.workspace_id = NEW.workspace_id
      AND m.user_id = NEW.owner_user_id
      AND m.role = 'OWNER'
      AND m.status = 'active'
      AND (m.expires_at_ms IS NULL OR m.expires_at_ms > NEW.applied_at_ms)
  );
  -- 5. The matched payment evidence row is still present and unchanged (status, tier, amount,
  --    currency, binding). If a payment is refunded or altered between verify and apply, abort.
  SELECT RAISE(ABORT, 'recovery CAS conflict: payment evidence changed')
  WHERE NOT (
    (NEW.evidence_kind = 'legacy-ipn'
      AND EXISTS (
        SELECT 1 FROM saas_nowpayments_ipn_events ev
        WHERE ev.payment_id = NEW.restored_payment_id
          AND ev.workspace_id = NEW.workspace_id
          AND ev.signature_verified = 1
          AND ev.payment_status = NEW.verified_payment_status
          AND ev.payment_status IN ('finished', 'confirmed')
          AND ev.target_tier = NEW.tier
          AND ABS(ev.pay_amount - NEW.verified_amount) < 1e-6
          AND UPPER(ev.pay_currency) = UPPER(NEW.verified_currency)
      ))
    OR
    (NEW.evidence_kind = 'payment-order'
      AND EXISTS (
        SELECT 1 FROM saas_payment_orders o
        WHERE o.order_id = NEW.evidence_order_id
          AND o.provider_payment_id = NEW.restored_payment_id
          AND o.workspace_id = NEW.workspace_id
          AND o.owner_user_id = NEW.owner_user_id
          AND o.target_tier = NEW.tier
          AND o.status = NEW.verified_payment_status
          AND o.status = 'finished'
          AND ABS(o.price_amount - NEW.verified_amount) < 1e-6
          AND UPPER(o.price_currency) = UPPER(NEW.verified_currency)
      ))
  );
  -- 6. The restore term must not already have ended at apply time: an expired entitlement is
  --    never turned into an active one (no grace, no term extension on any path).
  SELECT RAISE(ABORT, 'recovery restore term already ended')
  WHERE NOT (NEW.restored_expires_at_ms > NEW.applied_at_ms);
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
  -- Post-state check: the restore must land exactly one row in the exact target state, otherwise
  -- abort — which rolls back the entire statement, the audit row included. A no-op UPDATE, a
  -- missing row or a partial/wrong update can never leave a "restored" audit record behind.
  SELECT RAISE(ABORT, 'recovery restore failed: post-state not reached')
  WHERE (SELECT COUNT(*) FROM saas_workspace_entitlements e
         WHERE e.workspace_id = NEW.workspace_id
           AND e.owner_user_id = NEW.owner_user_id
           AND e.tier = NEW.tier
           AND e.revoked_at_ms IS NULL
           AND e.expires_at_ms IS NEW.restored_expires_at_ms
           AND e.current_payment_id IS NEW.restored_payment_id) <> 1;
END;
