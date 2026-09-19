// Alpha Persistence — D1 Adapter
// Cloudflare D1 implementation of PersistenceAdapter.

import type { AlphaResult } from '@/tree/alpha/types';
import type { ExperimentResult, ExperimentStatus } from '@/forest/alpha/experiments/types';
import type { D1Database } from '@/lib/db/types';
import type { PersistenceAdapter, StoredExperiment } from './types';
import { MIGRATE } from './d1-adapter-schema';
import { rowToExperiment, type AlphaExperimentListRow } from './d1-adapter-mappers';
import { INSERT_EXPERIMENT, buildExperimentBindings, type ExperimentWriteParams } from './d1-adapter-queries';

export class D1PersistenceAdapter implements PersistenceAdapter {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async migrate(): Promise<void> {
    for (const sql of MIGRATE.split(';')) {
      const s = sql.trim();
      if (s) await this.db.prepare(s).run();
    }
  }

  async saveResult(id: string, r: AlphaResult): Promise<void> {
    const t = Date.now();
    await this.db.prepare(
      `INSERT INTO alpha_results (id,name,source,result_json,created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, source=excluded.source, result_json=excluded.result_json`,
    ).bind(id, r.name, r.source, JSON.stringify(r), t).run();
  }

  async loadResult(id: string): Promise<AlphaResult | null> {
    const row = await this.db.prepare('SELECT result_json FROM alpha_results WHERE id=?')
      .bind(id).first<{ result_json: string }>();
    if (!row?.result_json) return null;
    try { return JSON.parse(row.result_json) as AlphaResult; } catch { return null; }
  }

  async saveExperiment(e: ExperimentWriteParams): Promise<void> {
    const t = Date.now();
    const bindings = [...buildExperimentBindings(e), 'pending', t, t];
    await this.db.prepare(INSERT_EXPERIMENT).bind(...bindings).run();
  }

  async loadExperiment(id: string): Promise<ReturnType<typeof rowToExperiment> | null> {
    const r = await this.db.prepare(
      `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,
              entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,
              slippage_model_json,train_period_json,validation_period_json,test_period_json,
              random_seed,git_commit,config_snapshot_json,status
       FROM alpha_experiments WHERE id=?`,
    ).bind(id).first<{
      id: string; hypothesis: string; dataset: string; symbol: string; timeframe: string;
      feature_set_json: string; regime_filter_json: string; entry_rule_json: string;
      exit_rule_json: string; position_sizing_json: string; fee_model_json: string;
      slippage_model_json: string; train_period_json: string; validation_period_json: string;
      test_period_json: string; random_seed: number | null; git_commit: string | null;
      config_snapshot_json: string; status: string;
    }>();
    if (!r) return null;
    try {
      return rowToExperiment({
        id: r.id, hypothesis: r.hypothesis, dataset: r.dataset, symbol: r.symbol, timeframe: r.timeframe,
        feature_set_json: r.feature_set_json, regime_filter_json: r.regime_filter_json,
        entry_rule_json: r.entry_rule_json, exit_rule_json: r.exit_rule_json,
        position_sizing_json: r.position_sizing_json, fee_model_json: r.fee_model_json,
        slippage_model_json: r.slippage_model_json, train_period_json: r.train_period_json,
        validation_period_json: r.validation_period_json, test_period_json: r.test_period_json,
        random_seed: r.random_seed, git_commit: r.git_commit, config_snapshot_json: r.config_snapshot_json,
        status: r.status as ExperimentStatus,
      });
    } catch { return null; }
  }

  async listExperiments(): Promise<StoredExperiment[]> {
    const { results } = await this.db.prepare(
      `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,
              entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,
              slippage_model_json,train_period_json,validation_period_json,test_period_json,
              random_seed,git_commit,config_snapshot_json,status,created_at,updated_at
       FROM alpha_experiments ORDER BY created_at DESC`,
    ).all<AlphaExperimentListRow>();
    return (results ?? []).map(r => ({
      id: r.id, hypothesis: r.hypothesis, dataset: r.dataset, symbol: r.symbol, timeframe: r.timeframe,
      featureSetJson: r.feature_set_json, regimeFilterJson: r.regime_filter_json,
      entryRuleJson: r.entry_rule_json, exitRuleJson: r.exit_rule_json,
      positionSizingJson: r.position_sizing_json, feeModelJson: r.fee_model_json,
      slippageModelJson: r.slippage_model_json,
      trainPeriodJson: r.train_period_json, validationPeriodJson: r.validation_period_json,
      testPeriodJson: r.test_period_json,
      randomSeed: r.random_seed, gitCommit: r.git_commit, configSnapshotJson: r.config_snapshot_json,
      status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async saveExperimentResult(experimentId: string, result: ExperimentResult): Promise<void> {
    const t = Date.now();
    await this.db.prepare(
      `INSERT INTO alpha_experiment_results (id,experiment_id,status,result_json,artifacts_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         status=excluded.status, result_json=excluded.result_json,
         artifacts_json=excluded.artifacts_json, updated_at=excluded.updated_at`,
    ).bind(`${experimentId}_${result.executedAt}`, experimentId, result.status,
      JSON.stringify(result), JSON.stringify(result.artifacts), t, t).run();
  }

  async loadExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
    const { results } = await this.db.prepare(
      'SELECT result_json FROM alpha_experiment_results WHERE experiment_id=? ORDER BY created_at DESC',
    ).bind(experimentId).all<{ result_json: string }>();
    if (!results?.length) return [];
    return results.map(r => { try { return JSON.parse(r.result_json) as ExperimentResult; } catch { return null; } })
      .filter((x): x is ExperimentResult => x !== null);
  }
}

export function createD1Adapter(db: D1Database): D1PersistenceAdapter {
  return new D1PersistenceAdapter(db);
}

export { MIGRATE as ALPHA_D1_MIGRATION };
