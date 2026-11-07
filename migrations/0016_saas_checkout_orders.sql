-- Checkout order mapping: orderId -> (workspaceId, targetTier, expectedAmount).
--
-- Why this table exists: NOWPayments does not send `workspace_id` or `target_tier`
-- back on an IPN callback. The only field it echoes is `order_id`. Before this
-- table the IPN handler read both values straight off the callback payload, so
-- anybody holding a valid signature could name their own tier. Storing the
-- decision server-side at invoice-creation time moves that authority back to the
-- server: the IPN path looks the order up and refuses to upgrade an unknown one.
--
-- Re-runnable: the migration runner applies every file in order on each call.

CREATE TABLE IF NOT EXISTS saas_checkout_orders (
  order_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  target_tier TEXT NOT NULL
    CHECK (target_tier IN ('BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER')),
  expected_amount_usd REAL NOT NULL,
  pay_currency TEXT NOT NULL,
  invoice_id TEXT,
  invoice_url TEXT,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_checkout_orders_workspace
  ON saas_checkout_orders(workspace_id, created_at_ms DESC);
