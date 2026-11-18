-- Gate G10: Durable Paper Ledger Positions Table.
-- Eliminates cold-restart position reconstruction ambiguity across multi-symbol
-- portfolios and leveraged margin rates (marginRateBps != 10_000).
-- Re-runnable: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS paper_ledger_positions (
  bot_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signed_qty_base INTEGER NOT NULL,
  open_notional_micro_usd INTEGER NOT NULL CHECK (open_notional_micro_usd >= 0),
  open_margin_micro_usd INTEGER NOT NULL CHECK (open_margin_micro_usd >= 0),
  fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (bot_id, symbol)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_paper_ledger_positions_bot
  ON paper_ledger_positions (bot_id);
