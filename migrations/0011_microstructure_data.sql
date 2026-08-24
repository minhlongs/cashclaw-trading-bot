-- Migration: 0011 — Microstructure raw data + causal feature vectors
-- Append-only research data store for the microstructure ingest pipeline.
-- Rows are never updated or deleted after insert; each poll appends new rows.
-- Additive only: no FKs, insert-and-read paths only, droppable without
-- affecting other tables.

-- One row per depth poll (immutable raw orderbook snapshot)
CREATE TABLE IF NOT EXISTS micro_depth_snapshots (
  poll_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  bids_json TEXT NOT NULL,
  asks_json TEXT NOT NULL,
  levels INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_micro_depth_symbol_ts ON micro_depth_snapshots(symbol, timestamp);

-- Trade prints chunked at <=500 prints per row (D1 row-size guard)
CREATE TABLE IF NOT EXISTS micro_trade_batches (
  batch_id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  first_trade_id INTEGER NOT NULL,
  last_trade_id INTEGER NOT NULL,
  prints_json TEXT NOT NULL,
  complete INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_micro_trade_poll ON micro_trade_batches(poll_id);

-- Computed feature vectors (9 declared contracts, null-preserving)
CREATE TABLE IF NOT EXISTS micro_feature_vectors (
  vector_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  features_json TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  git_sha TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_micro_vectors_symbol_ts ON micro_feature_vectors(symbol, timestamp);

-- Audit trail per poll: OK / DATA_INVALID / FETCH_FAILED (fail-closed log)
CREATE TABLE IF NOT EXISTS micro_ingest_log (
  log_id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
