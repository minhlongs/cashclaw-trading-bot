-- READ ONLY: case-by-case legacy entitlement recovery preflight.
-- Owner policy (2026-10-30): run against the production D1 AFTER migrations 0015-0017 are applied
-- and BEFORE any manual recovery. This classifies every non-BASIC entitlement row so the owner can
-- quantify how many rows fall into each recovery-review class. It intentionally contains no
-- UPDATE/INSERT/DELETE/DDL statements and must never be modified to mutate data.
-- Class meanings:
--   already-active-or-not-revoked          - row is not revoked; recovery does not apply
--   reject-identity-unverified             - no users row for the owner; identity cannot be verified
--   reject-membership-unverified           - identity exists but no active OWNER membership/workspace binding
--   candidate-order-backed-evidence        - a finished server-created order binds payment to the workspace;
--                                            recovery needs manual confirmation of amount/currency/tier/term
--   candidate-legacy-evidence-needs-manual-term - a signed finished legacy callback exists but the legacy
--                                            schema carries no order binding or expiry; the purchased term
--                                            must be reconciled from provider records before any restore
--   reject-payment-evidence-not-finished   - legacy callbacks exist but none is signed+finished
--   reject-no-payment-evidence             - no payment evidence of any kind
-- Missing proof is NEVER evidence that the customer did not pay; rejections mark review outcomes,
-- not customer guilt.

SELECT
  e.workspace_id,
  e.owner_user_id,
  e.tier,
  e.updated_at_ms,
  e.revoked_at_ms,
  e.expires_at_ms,
  e.current_payment_id,
  (SELECT COUNT(*) FROM users u WHERE u.id = e.owner_user_id) AS user_rows,
  (SELECT COUNT(*) FROM saas_workspaces w
     WHERE w.workspace_id = e.workspace_id AND w.owner_user_id = e.owner_user_id AND w.status = 'active') AS active_workspace_rows,
  (SELECT COUNT(*) FROM saas_workspace_memberships m
     WHERE m.workspace_id = e.workspace_id AND m.user_id = e.owner_user_id
       AND m.role = 'OWNER' AND m.status = 'active') AS owner_membership_rows,
  (SELECT COUNT(*) FROM saas_nowpayments_ipn_events i WHERE i.workspace_id = e.workspace_id) AS legacy_ipn_rows,
  (SELECT COUNT(*) FROM saas_nowpayments_ipn_events i
     WHERE i.workspace_id = e.workspace_id AND i.payment_status IN ('finished', 'confirmed') AND i.signature_verified = 1) AS signed_finished_ipn_rows,
  (SELECT COUNT(*) FROM saas_payment_orders o WHERE o.workspace_id = e.workspace_id) AS order_rows,
  (SELECT COUNT(*) FROM saas_payment_orders o WHERE o.workspace_id = e.workspace_id AND o.status = 'finished') AS finished_order_rows,
  CASE
    WHEN e.revoked_at_ms IS NULL THEN 'already-active-or-not-revoked'
    WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.owner_user_id) THEN 'reject-identity-unverified'
    WHEN NOT EXISTS (SELECT 1 FROM saas_workspaces w
                       WHERE w.workspace_id = e.workspace_id AND w.owner_user_id = e.owner_user_id AND w.status = 'active')
       OR NOT EXISTS (SELECT 1 FROM saas_workspace_memberships m
                       WHERE m.workspace_id = e.workspace_id AND m.user_id = e.owner_user_id
                         AND m.role = 'OWNER' AND m.status = 'active') THEN 'reject-membership-unverified'
    WHEN EXISTS (SELECT 1 FROM saas_payment_orders o
                   WHERE o.workspace_id = e.workspace_id AND o.status = 'finished') THEN 'candidate-order-backed-evidence'
    WHEN EXISTS (SELECT 1 FROM saas_nowpayments_ipn_events i
                   WHERE i.workspace_id = e.workspace_id AND i.payment_status IN ('finished', 'confirmed') AND i.signature_verified = 1)
         THEN 'candidate-legacy-evidence-needs-manual-term'
    WHEN EXISTS (SELECT 1 FROM saas_nowpayments_ipn_events i WHERE i.workspace_id = e.workspace_id)
         THEN 'reject-payment-evidence-not-finished'
    ELSE 'reject-no-payment-evidence'
  END AS recovery_review_class
FROM saas_workspace_entitlements e
WHERE e.tier <> 'BASIC'
ORDER BY e.workspace_id;

SELECT
  CASE
    WHEN e.revoked_at_ms IS NULL THEN 'already-active-or-not-revoked'
    WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.owner_user_id) THEN 'reject-identity-unverified'
    WHEN NOT EXISTS (SELECT 1 FROM saas_workspaces w
                       WHERE w.workspace_id = e.workspace_id AND w.owner_user_id = e.owner_user_id AND w.status = 'active')
       OR NOT EXISTS (SELECT 1 FROM saas_workspace_memberships m
                       WHERE m.workspace_id = e.workspace_id AND m.user_id = e.owner_user_id
                         AND m.role = 'OWNER' AND m.status = 'active') THEN 'reject-membership-unverified'
    WHEN EXISTS (SELECT 1 FROM saas_payment_orders o
                   WHERE o.workspace_id = e.workspace_id AND o.status = 'finished') THEN 'candidate-order-backed-evidence'
    WHEN EXISTS (SELECT 1 FROM saas_nowpayments_ipn_events i
                   WHERE i.workspace_id = e.workspace_id AND i.payment_status IN ('finished', 'confirmed') AND i.signature_verified = 1)
         THEN 'candidate-legacy-evidence-needs-manual-term'
    WHEN EXISTS (SELECT 1 FROM saas_nowpayments_ipn_events i WHERE i.workspace_id = e.workspace_id)
         THEN 'reject-payment-evidence-not-finished'
    ELSE 'reject-no-payment-evidence'
  END AS recovery_review_class,
  COUNT(*) AS row_count
FROM saas_workspace_entitlements e
WHERE e.tier <> 'BASIC'
GROUP BY recovery_review_class
ORDER BY recovery_review_class;
