-- Migration: 0009 — Research registry + hypothesis lineage
-- Machine-readable research evidence store. Append-only: rows are never
-- updated after insert; status changes are recorded as new evidence.

-- Hypothesis lineage graph (one row per hypothesis node)
CREATE TABLE IF NOT EXISTS research_hypotheses (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  mutation TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_hypotheses_parent ON research_hypotheses(parent_id);
CREATE INDEX IF NOT EXISTS idx_research_hypotheses_status ON research_hypotheses(status);

-- Research registry (one row per research entry; append-only)
CREATE TABLE IF NOT EXISTS research_registry (
  entry_id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL,
  data_sources_json TEXT NOT NULL,
  feature_set_json TEXT NOT NULL,
  regime TEXT,
  periods_json TEXT NOT NULL,
  costs_json TEXT NOT NULL,
  slippage_json TEXT NOT NULL,
  seed TEXT,
  git_commit TEXT,
  result_json TEXT,
  falsification_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  experiment_hash TEXT,
  reproducibility TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_registry_status ON research_registry(status);
CREATE INDEX IF NOT EXISTS idx_research_registry_created ON research_registry(created_at);
