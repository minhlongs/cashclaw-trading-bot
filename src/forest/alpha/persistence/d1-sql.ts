// Alpha Persistence — D1 SQL Migration
// DDL statements for alpha research tables (EXPERIMENTS, EXPERIMENT_RESULTS,
// ALPHA_EVALUATIONS) targeting Cloudflare D1 (SQLite-compatible).

// ── EXPERIMENTS ───────────────────────────────────────────────────────────────

export const EXPERIMENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS EXPERIMENTS (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  hypothesis TEXT,
  config_snapshot TEXT,
  symbol TEXT,
  timeframe TEXT,
  feature_set TEXT,
  regime_filter TEXT,
  entry_rule TEXT,
  exit_rule TEXT,
  position_sizing TEXT,
  fee_model TEXT,
  slippage_model TEXT,
  train_period TEXT,
  validation_period TEXT,
  test_period TEXT,
  random_seed INTEGER,
  git_commit TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON EXPERIMENTS(status);
`;

// ── EXPERIMENT_RESULTS ────────────────────────────────────────────────────────

export const EXPERIMENT_RESULTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS EXPERIMENT_RESULTS (
  id TEXT PRIMARY KEY,
  experiment_id TEXT REFERENCES EXPERIMENTS(id),
  window_index INTEGER,
  train_metrics TEXT,
  validate_metrics TEXT,
  test_metrics TEXT,
  regime TEXT,
  sharpe_ratio REAL,
  total_pnl REAL,
  win_rate REAL,
  total_trades INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_experiment_results_experiment ON EXPERIMENT_RESULTS(experiment_id);
`;

// ── ALPHA_EVALUATIONS ─────────────────────────────────────────────────────────

export const ALPHA_EVALUATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ALPHA_EVALUATIONS (
  id TEXT PRIMARY KEY,
  experiment_id TEXT REFERENCES EXPERIMENTS(id),
  alpha_id TEXT,
  alpha_name TEXT,
  total_contribution REAL,
  wins_contribution REAL,
  losses_contribution REAL,
  avg_confidence REAL,
  feature_importance TEXT,
  regime_breakdown TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alpha_evaluations_experiment ON ALPHA_EVALUATIONS(experiment_id);
`;

// ── Combined migration ────────────────────────────────────────────────────────

/** All three CREATE TABLE + index statements concatenated for migration. */
export const MIGRATION_SQL = [
  EXPERIMENTS_TABLE_SQL,
  EXPERIMENT_RESULTS_TABLE_SQL,
  ALPHA_EVALUATIONS_TABLE_SQL,
].join('\n');

// ── Rollback ──────────────────────────────────────────────────────────────────

/** DROP TABLE IF EXISTS statements for rollback. */
export const ROLLBACK_SQL = [
  'DROP TABLE IF EXISTS ALPHA_EVALUATIONS;',
  'DROP TABLE IF EXISTS EXPERIMENT_RESULTS;',
  'DROP TABLE IF EXISTS EXPERIMENTS;',
].join('\n');
