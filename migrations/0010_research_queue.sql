-- Migration: 0010 — Research queue lifecycle + multiple-testing counters
-- Append-only research queue store. Rows are never updated after insert;
-- status changes are recorded as new events (fold over events = state).
-- Additive only: no FKs, insert-and-read paths only, droppable without
-- affecting other tables.

-- One row per enqueued research job (immutable after insert)
CREATE TABLE IF NOT EXISTS research_queue_jobs (
  job_id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL,
  rationale TEXT NOT NULL,
  features_json TEXT NOT NULL,
  dataset TEXT NOT NULL,
  regime TEXT NOT NULL,
  universe_json TEXT NOT NULL,
  costs_json TEXT NOT NULL,
  slippage_json TEXT NOT NULL,
  seed INTEGER,
  parent_hypothesis TEXT,
  generated_by TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  git_sha TEXT,
  status TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_queue_jobs_hash ON research_queue_jobs(config_hash);
CREATE INDEX IF NOT EXISTS idx_research_queue_jobs_created ON research_queue_jobs(created_at);

-- Append-only transition log (one row per applied trigger)
CREATE TABLE IF NOT EXISTS research_queue_events (
  event_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_queue_events_job ON research_queue_events(job_id);

-- Append-only multiple-testing counter snapshots (audit trail)
CREATE TABLE IF NOT EXISTS research_testing_counters (
  snapshot_id TEXT PRIMARY KEY,
  counters_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
