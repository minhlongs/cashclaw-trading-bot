// Alpha Persistence — D1 Experiment Queries
// Experiment write-path SQL (saveExperiment) — kept separate to keep the adapter facade ≤150 LOC.

export const INSERT_EXPERIMENT = `
INSERT INTO alpha_experiments
  (id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,
   entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,
   slippage_model_json,train_period_json,validation_period_json,test_period_json,
   random_seed,git_commit,config_snapshot_json,status,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  hypothesis=excluded.hypothesis, dataset=excluded.dataset, symbol=excluded.symbol,
  timeframe=excluded.timeframe, feature_set_json=excluded.feature_set_json,
  regime_filter_json=excluded.regime_filter_json, entry_rule_json=excluded.entry_rule_json,
  exit_rule_json=excluded.exit_rule_json, position_sizing_json=excluded.position_sizing_json,
  fee_model_json=excluded.fee_model_json, slippage_model_json=excluded.slippage_model_json,
  train_period_json=excluded.train_period_json, validation_period_json=excluded.validation_period_json,
  test_period_json=excluded.test_period_json, random_seed=excluded.random_seed,
  git_commit=excluded.git_commit, config_snapshot_json=excluded.config_snapshot_json,
  status=excluded.status, updated_at=excluded.updated_at`;

export interface ExperimentWriteParams {
  id: string;
  hypothesis: string;
  dataset: string;
  symbol: string;
  timeframe: string;
  featureSet: unknown;
  regimeFilter: unknown;
  entryRule: unknown;
  exitRule: unknown;
  positionSizing: unknown;
  feeModel: unknown;
  slippageModel: unknown;
  trainPeriod: unknown;
  validationPeriod: unknown;
  testPeriod: unknown;
  randomSeed?: number | null;
  gitCommit?: string | null;
  configSnapshot: unknown;
}

export function buildExperimentBindings(p: ExperimentWriteParams): unknown[] {
  return [
    p.id, p.hypothesis, p.dataset, p.symbol, p.timeframe,
    JSON.stringify(p.featureSet), JSON.stringify(p.regimeFilter),
    JSON.stringify(p.entryRule), JSON.stringify(p.exitRule),
    JSON.stringify(p.positionSizing), JSON.stringify(p.feeModel),
    JSON.stringify(p.slippageModel),
    JSON.stringify(p.trainPeriod), JSON.stringify(p.validationPeriod), JSON.stringify(p.testPeriod),
    p.randomSeed ?? null, p.gitCommit ?? null, JSON.stringify(p.configSnapshot),
  ];
}
