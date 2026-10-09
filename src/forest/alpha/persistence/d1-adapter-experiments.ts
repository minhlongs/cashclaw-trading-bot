import type { ExperimentStatus } from '@/forest/alpha/experiments/types';
import type { D1Database } from '@/lib/db/types';
import type { StoredExperiment } from './types';
import { rowToExperiment, type AlphaExperimentListRow } from './d1-adapter-mappers';
import { INSERT_EXPERIMENT, buildExperimentBindings, type ExperimentWriteParams } from './d1-adapter-queries';

export async function d1SaveExperiment(db: D1Database, e: ExperimentWriteParams): Promise<void> {
  const t = Date.now(), bindings = [...buildExperimentBindings(e), 'pending', t, t];
  await db.prepare(INSERT_EXPERIMENT).bind(...bindings).run();
}

export async function d1LoadExperiment(db: D1Database, id: string): Promise<ReturnType<typeof rowToExperiment> | null> {
  const r = await db.prepare(
    `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,slippage_model_json,train_period_json,validation_period_json,test_period_json,random_seed,git_commit,config_snapshot_json,status
     FROM alpha_experiments WHERE id=?`,
  ).bind(id).first<Record<string, unknown>>();
  if (!r) return null;
  try { return rowToExperiment({ ...r, status: r['status'] as ExperimentStatus } as Parameters<typeof rowToExperiment>[0]); } catch { return null; }
}

export async function d1ListExperiments(db: D1Database): Promise<StoredExperiment[]> {
  const { results } = await db.prepare(
    `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,slippage_model_json,train_period_json,validation_period_json,test_period_json,random_seed,git_commit,config_snapshot_json,status,created_at,updated_at
     FROM alpha_experiments ORDER BY created_at DESC`,
  ).all<AlphaExperimentListRow>();
  return (results ?? []).map(r => ({
    id: r.id, hypothesis: r.hypothesis, dataset: r.dataset, symbol: r.symbol, timeframe: r.timeframe,
    featureSetJson: r.feature_set_json, regimeFilterJson: r.regime_filter_json, entryRuleJson: r.entry_rule_json, exitRuleJson: r.exit_rule_json,
    positionSizingJson: r.position_sizing_json, feeModelJson: r.fee_model_json, slippageModelJson: r.slippage_model_json,
    trainPeriodJson: r.train_period_json, validationPeriodJson: r.validation_period_json, testPeriodJson: r.test_period_json,
    randomSeed: r.random_seed, gitCommit: r.git_commit, configSnapshotJson: r.config_snapshot_json, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}
