-- Step 16: Cloudflare D1 SaaS Entitlements & NOWPayments IPN Ledger (Migration 0013)
-- Canonical Tier Enum: BASIC | PREMIUM | ENTERPRISE | MASTER

CREATE TABLE IF NOT EXISTS saas_workspace_entitlements (
  workspace_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'BASIC' CHECK (tier IN ('BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER')),
  max_running_bots INTEGER NOT NULL DEFAULT 1,
  max_walk_forward_windows INTEGER NOT NULL DEFAULT 4,
  monthly_llm_credits INTEGER NOT NULL DEFAULT 1000,
  managed_llm_pool_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_nowpayments_ipn_events (
  payment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  target_tier TEXT NOT NULL CHECK (target_tier IN ('BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER')),
  payment_status TEXT NOT NULL,
  pay_amount REAL NOT NULL,
  pay_currency TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 1,
  processed_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_ipn_workspace
  ON saas_nowpayments_ipn_events(workspace_id, processed_at_ms DESC);
