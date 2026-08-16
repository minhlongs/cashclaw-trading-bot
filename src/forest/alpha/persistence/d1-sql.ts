// Alpha Persistence — D1 SQL Constants
// Table DDL and migration statements for alpha results and experiments.

export const CREATE_ALPHA_RESULTS = `
CREATE TABLE IF NOT EXISTS alpha_results (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

export const CREATE_ALPHA_EXPERIMENTS = `
CREATE TABLE IF NOT EXISTS alpha_experiments (
  id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL,
  dataset TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  feature_set_json TEXT NOT NULL,
  regime_filter_json TEXT NOT NULL,
  entry_rule_json TEXT NOT NULL,
  exit_rule_json TEXT NOT NULL,
  position_sizing_json TEXT NOT NULL,
  fee_model_json TEXT NOT NULL,
  slippage_model_json TEXT NOT NULL,
  train_period_json TEXT NOT NULL,
  validation_period_json TEXT NOT NULL,
  test_period_json TEXT NOT NULL,
  random_seed INTEGER,
  git_commit TEXT,
  config_snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export const CREATE_ALPHA_EXP_RESULTS = `
CREATE TABLE IF NOT EXISTS alpha_experiment_results (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT NOT NULL,
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export const CREATE_IDX_ALPHA_RESULTS_NAME = `
CREATE INDEX IF NOT EXISTS idx_alpha_results_name ON alpha_results(name)`;

export const CREATE_IDX_ALPHA_EXP_EXPERIMENT = `
CREATE INDEX IF NOT EXISTS idx_alpha_exp_experiment ON alpha_experiment_results(experiment_id)`;

/** Combined migration SQL — run each statement via .run(). */
export const ALPHA_D1_MIGRATION = [
  CREATE_ALPHA_RESULTS,
  CREATE_ALPHA_EXPERIMENTS,
  CREATE_ALPHA_EXP_RESULTS,
  CREATE_IDX_ALPHA_RESULTS_NAME,
  CREATE_IDX_ALPHA_EXP_EXPERIMENT,
].join(';');