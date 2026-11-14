-- Gate G10: Paper Double-Entry Micro-Unit Ledger, Idempotent Event Hashes,
-- Durable Paper Order Intents, and Atomic Scheduler Leases with Fencing Tokens.
-- Re-runnable: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS ONLY.
-- Monetary columns use exact integer micro-USD (1 USD = 1_000_000 micro-USD).
-- Quantity columns use exact integer base-units / satoshis (1 unit = 100_000_000).

CREATE TABLE IF NOT EXISTS paper_ledger_accounts (
  bot_id TEXT NOT NULL,
  cash_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (cash_micro_usd >= 0),
  margin_reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (margin_reserved_micro_usd >= 0),
  position_margin_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (position_margin_micro_usd >= 0),
  realized_pnl_micro_usd INTEGER NOT NULL DEFAULT 0,
  fees_expense_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (fees_expense_micro_usd >= 0),
  funding_net_micro_usd INTEGER NOT NULL DEFAULT 0,
  initial_capital_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (initial_capital_micro_usd >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (bot_id)
) STRICT;

CREATE TABLE IF NOT EXISTS paper_journal_entries (
  entry_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  leg_index INTEGER NOT NULL CHECK (leg_index >= 0),
  account_code TEXT NOT NULL CHECK (
    account_code IN (
      'CASH_AVAILABLE',
      'MARGIN_RESERVED',
      'POSITION_MARGIN',
      'REALIZED_PNL',
      'FEES_EXPENSE',
      'FUNDING_NET',
      'INITIAL_CAPITAL'
    )
  ),
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_micro_usd INTEGER NOT NULL CHECK (amount_micro_usd > 0),
  account_version INTEGER NOT NULL CHECK (account_version > 0),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (entry_id, leg_index)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_paper_journal_bot_version
  ON paper_journal_entries(bot_id, account_version);

CREATE TABLE IF NOT EXISTS processed_event_hashes (
  bot_id TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  account_version INTEGER NOT NULL CHECK (account_version >= 0),
  processed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (bot_id, event_hash),
  UNIQUE (bot_id, event_hash)
) STRICT;

CREATE TABLE IF NOT EXISTS paper_order_intents (
  bot_id TEXT NOT NULL,
  client_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
  quantity_base INTEGER NOT NULL CHECK (quantity_base > 0),
  filled_qty_base INTEGER NOT NULL DEFAULT 0 CHECK (filled_qty_base >= 0 AND filled_qty_base <= quantity_base),
  limit_price_micro_usd INTEGER NOT NULL CHECK (limit_price_micro_usd > 0),
  reserved_margin_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_margin_micro_usd >= 0),
  reduce_only INTEGER NOT NULL DEFAULT 0 CHECK (reduce_only IN (0, 1)),
  lifecycle_state TEXT NOT NULL CHECK (
    lifecycle_state IN (
      'PENDING_INTENT',
      'PENDING_ACK',
      'RECONCILING',
      'OPEN',
      'PARTIALLY_FILLED',
      'FILLED',
      'CANCELLED',
      'REJECTED',
      'EXPIRED'
    )
  ),
  fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (bot_id, client_order_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_paper_order_intents_bot_state
  ON paper_order_intents(bot_id, lifecycle_state);

CREATE TABLE IF NOT EXISTS scheduler_bot_leases (
  bot_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL DEFAULT 1 CHECK (fencing_token >= 1),
  acquired_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (bot_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_scheduler_bot_leases_workspace
  ON scheduler_bot_leases(workspace_id, expires_at_ms);
