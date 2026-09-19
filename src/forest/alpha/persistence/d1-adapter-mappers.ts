// Alpha Persistence — D1 Row Mappers
// Row shapes returned by D1 queries + row-to-domain mapping for experiments.

import type { Experiment, ExperimentStatus } from '@/forest/alpha/experiments/types';

export interface AlphaExperimentRow {
  id: string;
  hypothesis: string;
  dataset: string;
  symbol: string;
  timeframe: string;
  feature_set_json: string;
  regime_filter_json: string;
  entry_rule_json: string;
  exit_rule_json: string;
  position_sizing_json: string;
  fee_model_json: string;
  slippage_model_json: string;
  train_period_json: string;
  validation_period_json: string;
  test_period_json: string;
  random_seed: number | null;
  git_commit: string | null;
  config_snapshot_json: string;
  status: ExperimentStatus;
}

export interface AlphaExperimentListRow extends AlphaExperimentRow {
  created_at: number;
  updated_at: number;
}

export function rowToExperiment(r: AlphaExperimentRow): Experiment {
  return {
    id: r.id,
    hypothesis: r.hypothesis,
    dataset: r.dataset,
    symbol: r.symbol,
    timeframe: r.timeframe,
    featureSet: JSON.parse(r.feature_set_json) as Experiment['featureSet'],
    regimeFilter: JSON.parse(r.regime_filter_json) as Experiment['regimeFilter'],
    entryRule: JSON.parse(r.entry_rule_json) as Experiment['entryRule'],
    exitRule: JSON.parse(r.exit_rule_json) as Experiment['exitRule'],
    positionSizing: JSON.parse(r.position_sizing_json) as Experiment['positionSizing'],
    feeModel: JSON.parse(r.fee_model_json) as Experiment['feeModel'],
    slippageModel: JSON.parse(r.slippage_model_json) as Experiment['slippageModel'],
    trainPeriod: JSON.parse(r.train_period_json) as Experiment['trainPeriod'],
    validationPeriod: JSON.parse(r.validation_period_json) as Experiment['validationPeriod'],
    testPeriod: JSON.parse(r.test_period_json) as Experiment['testPeriod'],
    randomSeed: r.random_seed ?? undefined,
    gitCommit: r.git_commit ?? undefined,
    configSnapshot: JSON.parse(r.config_snapshot_json) as Experiment['configSnapshot'],
  };
}
