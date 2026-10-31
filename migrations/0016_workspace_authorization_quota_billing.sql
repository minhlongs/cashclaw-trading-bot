-- Establish server-owned workspace membership, expiring entitlements, atomic bot slots,
-- payment-order binding, and durable callback history. Never infer membership from request input.

ALTER TABLE saas_workspace_entitlements ADD COLUMN expires_at_ms INTEGER;
ALTER TABLE saas_workspace_entitlements ADD COLUMN revoked_at_ms INTEGER;
ALTER TABLE saas_workspace_entitlements ADD COLUMN current_payment_id TEXT;
ALTER TABLE bots ADD COLUMN workspace_id TEXT;

CREATE TABLE IF NOT EXISTS saas_workspaces (
  workspace_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_workspace_memberships (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'TRADER', 'VIEWER')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_saas_workspace_memberships_user
  ON saas_workspace_memberships(user_id, status, workspace_id);

-- Keep verifiable owners from pre-existing entitlement rows only when the owner still exists.
-- The legacy tables have no foreign keys; never create a workspace/membership for an orphan ID.
INSERT OR IGNORE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
SELECT workspace_id, owner_user_id, 'active', updated_at_ms
FROM saas_workspace_entitlements
WHERE owner_user_id NOT IN ('system', 'default', '')
  AND EXISTS (SELECT 1 FROM users WHERE users.id = saas_workspace_entitlements.owner_user_id);

INSERT OR IGNORE INTO saas_workspace_memberships
  (workspace_id, user_id, role, status, expires_at_ms, created_at_ms)
SELECT workspace_id, owner_user_id, 'OWNER', 'active', NULL, updated_at_ms
FROM saas_workspace_entitlements
WHERE owner_user_id NOT IN ('system', 'default', '')
  AND EXISTS (SELECT 1 FROM users WHERE users.id = saas_workspace_entitlements.owner_user_id);

-- Existing paid rows without an expiry/order cannot prove an active subscription: fail closed.
UPDATE saas_workspace_entitlements
SET revoked_at_ms = COALESCE(revoked_at_ms, updated_at_ms)
WHERE tier <> 'BASIC' AND expires_at_ms IS NULL;

-- Provision one BASIC personal workspace for each existing session/bot owner. Workspace IDs are
-- deterministic server-derived IDs; caller-provided IDs never create membership.
INSERT OR IGNORE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
SELECT 'personal:' || s.user_id, s.user_id, 'active', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.user_id <> '';
INSERT OR IGNORE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
SELECT 'personal:' || b.user_id, b.user_id, 'active', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM bots b JOIN users u ON u.id = b.user_id WHERE b.user_id <> '';

INSERT OR IGNORE INTO saas_workspace_memberships
  (workspace_id, user_id, role, status, expires_at_ms, created_at_ms)
SELECT workspace_id, owner_user_id, 'OWNER', 'active', NULL, created_at_ms
FROM saas_workspaces
WHERE workspace_id LIKE 'personal:%';

INSERT OR IGNORE INTO saas_workspace_entitlements
  (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows,
   monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms, expires_at_ms, revoked_at_ms, current_payment_id)
SELECT workspace_id, owner_user_id, 'BASIC', 1, 4, 1000, 0, created_at_ms, NULL, NULL, NULL
FROM saas_workspaces
WHERE workspace_id LIKE 'personal:%';

UPDATE bots SET workspace_id = 'personal:' || user_id
WHERE workspace_id IS NULL AND user_id <> ''
  AND EXISTS (SELECT 1 FROM users WHERE users.id = bots.user_id);
CREATE INDEX IF NOT EXISTS idx_bots_workspace_status
  ON bots(workspace_id, status, id);

CREATE TABLE IF NOT EXISTS saas_bot_create_reservations (
  bot_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'created', 'failed')),
  lease_expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saas_bot_reservations_quota
  ON saas_bot_create_reservations(workspace_id, status, lease_expires_at_ms);

CREATE TABLE IF NOT EXISTS saas_payment_orders (
  order_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  target_tier TEXT NOT NULL CHECK (target_tier IN ('PREMIUM', 'ENTERPRISE', 'MASTER')),
  price_amount REAL NOT NULL CHECK (price_amount > 0),
  price_currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'expired', 'refunded', 'cancelled')),
  provider_payment_id TEXT UNIQUE,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  paid_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_saas_payment_orders_workspace
  ON saas_payment_orders(workspace_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS saas_nowpayments_ipn_event_history (
  event_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_verified INTEGER NOT NULL CHECK (signature_verified = 1),
  processed INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0, 1)),
  received_at_ms INTEGER NOT NULL,
  UNIQUE (payment_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS idx_saas_ipn_event_order
  ON saas_nowpayments_ipn_event_history(order_id, received_at_ms);
