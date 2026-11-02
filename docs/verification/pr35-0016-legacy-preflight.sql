-- READ ONLY: run against the isolated/pre-migration D1 snapshot before 0016.
-- This script intentionally contains no UPDATE/INSERT/DELETE/DDL statements.

SELECT
  e.workspace_id,
  e.owner_user_id,
  e.tier,
  e.updated_at_ms,
  COUNT(i.payment_id) AS legacy_ipn_rows,
  SUM(CASE WHEN i.payment_status IN ('finished', 'confirmed') AND i.signature_verified = 1 THEN 1 ELSE 0 END) AS signed_finished_ipn_rows,
  MAX(i.processed_at_ms) AS latest_legacy_ipn_at_ms
FROM saas_workspace_entitlements e
LEFT JOIN saas_nowpayments_ipn_events i ON i.workspace_id = e.workspace_id
GROUP BY e.workspace_id, e.owner_user_id, e.tier, e.updated_at_ms
ORDER BY e.workspace_id;

SELECT payment_status, signature_verified, COUNT(*) AS row_count,
       MIN(processed_at_ms) AS earliest_processed_at_ms,
       MAX(processed_at_ms) AS latest_processed_at_ms
FROM saas_nowpayments_ipn_events
GROUP BY payment_status, signature_verified
ORDER BY payment_status, signature_verified;

SELECT name AS present_new_schema_table
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('saas_workspaces', 'saas_workspace_memberships', 'saas_payment_orders', 'saas_nowpayments_ipn_event_history')
ORDER BY name;

SELECT e.owner_user_id, COUNT(DISTINCT u.id) AS user_rows,
       COUNT(DISTINCT s.id) AS session_rows, COUNT(DISTINCT b.id) AS bot_rows
FROM saas_workspace_entitlements e
LEFT JOIN users u ON u.id = e.owner_user_id
LEFT JOIN user_sessions s ON s.user_id = e.owner_user_id
LEFT JOIN bots b ON b.user_id = e.owner_user_id
WHERE e.tier <> 'BASIC'
GROUP BY e.owner_user_id
ORDER BY e.owner_user_id;

-- Explicit integrity cases: do not infer that absent users mean invalid payment or valid entitlement.
SELECT e.workspace_id, e.owner_user_id, e.tier,
       COUNT(DISTINCT i.payment_id) AS legacy_ipn_rows,
       COUNT(DISTINCT s.id) AS session_rows,
       COUNT(DISTINCT b.id) AS bot_rows
FROM saas_workspace_entitlements e
LEFT JOIN users u ON u.id = e.owner_user_id
LEFT JOIN saas_nowpayments_ipn_events i ON i.workspace_id = e.workspace_id
LEFT JOIN user_sessions s ON s.user_id = e.owner_user_id
LEFT JOIN bots b ON b.user_id = e.owner_user_id
WHERE u.id IS NULL
GROUP BY e.workspace_id, e.owner_user_id, e.tier
ORDER BY e.workspace_id;

SELECT s.user_id, COUNT(*) AS orphan_session_rows
FROM user_sessions s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL
GROUP BY s.user_id
ORDER BY s.user_id;

SELECT b.user_id, COUNT(*) AS orphan_bot_rows
FROM bots b
LEFT JOIN users u ON u.id = b.user_id
WHERE u.id IS NULL
GROUP BY b.user_id
ORDER BY b.user_id;
