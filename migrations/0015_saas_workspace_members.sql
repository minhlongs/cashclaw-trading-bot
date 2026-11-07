-- Step 19: Workspace membership mapping (user_id -> workspace_id).
-- Closes the gap in migration 0013: saas_workspace_entitlements stores
-- owner_user_id but no table allowed the reverse lookup a session needs.
-- Re-runnable: the migration runner applies every file in order on each call.

CREATE TABLE IF NOT EXISTS saas_workspace_members (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER'
    CHECK (role IN ('OWNER', 'ADMIN', 'TRADER', 'VIEWER')),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_members_user
  ON saas_workspace_members(user_id);

-- Backfill only from an owner that is already a real user id. Workspaces whose
-- owner_user_id is the sentinel 'system' deliberately get no member row: the
-- value is empty, not an owner, and guessing one would hand a paid tier to the
-- wrong account. Those workspaces need manual anchoring.
INSERT OR IGNORE INTO saas_workspace_members (user_id, workspace_id, role, created_at_ms)
SELECT owner_user_id, workspace_id, 'OWNER', 0
  FROM saas_workspace_entitlements
 WHERE owner_user_id IS NOT NULL AND owner_user_id <> 'system';
