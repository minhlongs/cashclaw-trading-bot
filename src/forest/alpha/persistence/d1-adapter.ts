// Alpha Persistence — D1 Adapter
// Cloudflare D1 implementation of PersistenceAdapter.

import type { AlphaResult } from '@/tree/alpha/types';
import type { Experiment, ExperimentResult, ExperimentStatus } from '@/forest/alpha/experiments/types';
import type { D1Database } from '@/lib/db/types';
import type {
  PersistenceAdapter,
  StoredHypothesisNode,
  StoredRegistryEntry,
} from './types';
import {
  RESEARCH_HYPOTHESES_TABLE_SQL,
  RESEARCH_REGISTRY_TABLE_SQL,
} from './d1-sql';

const MIGRATE = `
CREATE TABLE IF NOT EXISTS alpha_results (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL,
  result_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alpha_experiments (
  id TEXT PRIMARY KEY, hypothesis TEXT NOT NULL, dataset TEXT NOT NULL,
  symbol TEXT NOT NULL, timeframe TEXT NOT NULL,
  feature_set_json TEXT NOT NULL, regime_filter_json TEXT NOT NULL,
  entry_rule_json TEXT NOT NULL, exit_rule_json TEXT NOT NULL,
  position_sizing_json TEXT NOT NULL, fee_model_json TEXT NOT NULL,
  slippage_model_json TEXT NOT NULL, train_period_json TEXT NOT NULL,
  validation_period_json TEXT NOT NULL, test_period_json TEXT NOT NULL,
  random_seed INTEGER, git_commit TEXT, config_snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alpha_experiment_results (
  id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT NOT NULL, artifacts_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alpha_results_name ON alpha_results(name);
CREATE INDEX IF NOT EXISTS idx_alpha_exp_experiment ON alpha_experiment_results(experiment_id);
${RESEARCH_HYPOTHESES_TABLE_SQL}
${RESEARCH_REGISTRY_TABLE_SQL}
`;

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

  async saveExperiment(e: Experiment): Promise<void> {
    const t = Date.now();
    await this.db.prepare(
      `INSERT INTO alpha_experiments
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
         status=excluded.status, updated_at=excluded.updated_at`,
    ).bind(
      e.id, e.hypothesis, e.dataset, e.symbol, e.timeframe,
      JSON.stringify(e.featureSet), JSON.stringify(e.regimeFilter),
      JSON.stringify(e.entryRule), JSON.stringify(e.exitRule),
      JSON.stringify(e.positionSizing), JSON.stringify(e.feeModel),
      JSON.stringify(e.slippageModel),
      JSON.stringify(e.trainPeriod), JSON.stringify(e.validationPeriod), JSON.stringify(e.testPeriod),
      e.randomSeed ?? null, e.gitCommit ?? null, JSON.stringify(e.configSnapshot),
      'pending', t, t,
    ).run();
  }

  private rowToExperiment(r: {
    id:string; hypothesis:string; dataset:string; symbol:string; timeframe:string;
    feature_set_json:string; regime_filter_json:string; entry_rule_json:string;
    exit_rule_json:string; position_sizing_json:string; fee_model_json:string;
    slippage_model_json:string; train_period_json:string; validation_period_json:string;
    test_period_json:string; random_seed:number|null; git_commit:string|null;
    config_snapshot_json:string; status:ExperimentStatus;
  }): Experiment {
    return {
      id:r.id, hypothesis:r.hypothesis, dataset:r.dataset, symbol:r.symbol, timeframe:r.timeframe,
      featureSet:JSON.parse(r.feature_set_json) as Experiment['featureSet'],
      regimeFilter:JSON.parse(r.regime_filter_json) as Experiment['regimeFilter'],
      entryRule:JSON.parse(r.entry_rule_json) as Experiment['entryRule'],
      exitRule:JSON.parse(r.exit_rule_json) as Experiment['exitRule'],
      positionSizing:JSON.parse(r.position_sizing_json) as Experiment['positionSizing'],
      feeModel:JSON.parse(r.fee_model_json) as Experiment['feeModel'],
      slippageModel:JSON.parse(r.slippage_model_json) as Experiment['slippageModel'],
      trainPeriod:JSON.parse(r.train_period_json) as Experiment['trainPeriod'],
      validationPeriod:JSON.parse(r.validation_period_json) as Experiment['validationPeriod'],
      testPeriod:JSON.parse(r.test_period_json) as Experiment['testPeriod'],
      randomSeed:r.random_seed ?? undefined,
      gitCommit:r.git_commit ?? undefined,
      configSnapshot:JSON.parse(r.config_snapshot_json) as Experiment['configSnapshot'],
    };
  }

  async loadExperiment(id: string): Promise<Experiment | null> {
    const r = await this.db.prepare(
      `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,
              entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,
              slippage_model_json,train_period_json,validation_period_json,test_period_json,
              random_seed,git_commit,config_snapshot_json,status
       FROM alpha_experiments WHERE id=?`,
    ).bind(id).first<{
      id:string; hypothesis:string; dataset:string; symbol:string; timeframe:string;
      feature_set_json:string; regime_filter_json:string; entry_rule_json:string;
      exit_rule_json:string; position_sizing_json:string; fee_model_json:string;
      slippage_model_json:string; train_period_json:string; validation_period_json:string;
      test_period_json:string; random_seed:number|null; git_commit:string|null;
      config_snapshot_json:string; status:ExperimentStatus;
    }>();
    if (!r) return null;
    try { return this.rowToExperiment(r); } catch { return null; }
  }

  async listExperiments(): Promise<import('./types').StoredExperiment[]> {
    const { results } = await this.db.prepare(
      `SELECT id,hypothesis,dataset,symbol,timeframe,feature_set_json,regime_filter_json,
              entry_rule_json,exit_rule_json,position_sizing_json,fee_model_json,
              slippage_model_json,train_period_json,validation_period_json,test_period_json,
              random_seed,git_commit,config_snapshot_json,status,created_at,updated_at
       FROM alpha_experiments ORDER BY created_at DESC`,
    ).all<{
      id:string; hypothesis:string; dataset:string; symbol:string; timeframe:string;
      feature_set_json:string; regime_filter_json:string; entry_rule_json:string;
      exit_rule_json:string; position_sizing_json:string; fee_model_json:string;
      slippage_model_json:string; train_period_json:string; validation_period_json:string;
      test_period_json:string; random_seed:number|null; git_commit:string|null;
      config_snapshot_json:string; status:ExperimentStatus; created_at:number; updated_at:number;
    }>();
    return (results ?? []).map(r => ({
      id:r.id, hypothesis:r.hypothesis, dataset:r.dataset, symbol:r.symbol, timeframe:r.timeframe,
      featureSetJson:r.feature_set_json, regimeFilterJson:r.regime_filter_json,
      entryRuleJson:r.entry_rule_json, exitRuleJson:r.exit_rule_json,
      positionSizingJson:r.position_sizing_json, feeModelJson:r.fee_model_json,
      slippageModelJson:r.slippage_model_json,
      trainPeriodJson:r.train_period_json, validationPeriodJson:r.validation_period_json,
      testPeriodJson:r.test_period_json,
      randomSeed:r.random_seed, gitCommit:r.git_commit, configSnapshotJson:r.config_snapshot_json,
      status:r.status,
      createdAt:r.created_at, updatedAt:r.updated_at,
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

  // ── Research registry (append-only — no UPDATE paths) ─────────────────────

  async saveRegistryEntry(entry: StoredRegistryEntry): Promise<void> {
    await this.db.prepare(INSERT_RESEARCH_REGISTRY_ENTRY_SQL).bind(
      entry.entryId, entry.hypothesis, entry.dataSourcesJson, entry.featureSetJson,
      entry.regime, entry.periodsJson, entry.costsJson, entry.slippageJson,
      entry.seed, entry.gitCommit, entry.resultJson, entry.falsificationReason,
      entry.status, entry.experimentHash, entry.reproducibility, entry.createdAt,
    ).run();
  }

  async listRegistry(): Promise<StoredRegistryEntry[]> {
    const { results } = await this.db.prepare(SELECT_RESEARCH_REGISTRY_SQL)
      .all<RegistryRow>();
    return (results ?? []).map(rowToRegistryEntry);
  }

  async saveHypothesisNode(node: StoredHypothesisNode): Promise<void> {
    await this.db.prepare(INSERT_RESEARCH_HYPOTHESIS_SQL).bind(
      node.id, node.parentId, node.mutation, node.status, node.evidenceJson, node.createdAt,
    ).run();
  }

  async loadLineage(): Promise<StoredHypothesisNode[]> {
    const { results } = await this.db.prepare(SELECT_RESEARCH_HYPOTHESES_SQL)
      .all<HypothesisRow>();
    return (results ?? []).map(rowToHypothesisNode);
  }
}

// ── Research registry row shapes ─────────────────────────────────────────────

// ── Research registry SQL (append-only — no UPDATE paths) ────────────────────
const INSERT_RESEARCH_HYPOTHESIS_SQL = `
INSERT INTO research_hypotheses (id, parent_id, mutation, status, evidence_json, created_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO NOTHING
`;

const SELECT_RESEARCH_HYPOTHESES_SQL = `
SELECT id, parent_id, mutation, status, evidence_json, created_at
FROM research_hypotheses
ORDER BY created_at ASC, id ASC
`;

const INSERT_RESEARCH_REGISTRY_ENTRY_SQL = `
INSERT INTO research_registry (
  entry_id, hypothesis, data_sources_json, feature_set_json, regime,
  periods_json, costs_json, slippage_json, seed, git_commit,
  result_json, falsification_reason, status, experiment_hash, reproducibility, created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(entry_id) DO NOTHING
`;

const SELECT_RESEARCH_REGISTRY_SQL = `
SELECT entry_id, hypothesis, data_sources_json, feature_set_json, regime,
       periods_json, costs_json, slippage_json, seed, git_commit,
       result_json, falsification_reason, status, experiment_hash, reproducibility, created_at
FROM research_registry
ORDER BY created_at DESC, entry_id DESC
`;

interface RegistryRow {
  entry_id: string;
  hypothesis: string;
  data_sources_json: string;
  feature_set_json: string;
  regime: string | null;
  periods_json: string;
  costs_json: string;
  slippage_json: string;
  seed: string | null;
  git_commit: string | null;
  result_json: string | null;
  falsification_reason: string | null;
  status: StoredRegistryEntry['status'];
  experiment_hash: string | null;
  reproducibility: string | null;
  created_at: number;
}

interface HypothesisRow {
  id: string;
  parent_id: string | null;
  mutation: string | null;
  status: StoredHypothesisNode['status'];
  evidence_json: string;
  created_at: number;
}

function rowToRegistryEntry(r: RegistryRow): StoredRegistryEntry {
  return {
    entryId: r.entry_id,
    hypothesis: r.hypothesis,
    dataSourcesJson: r.data_sources_json,
    featureSetJson: r.feature_set_json,
    regime: r.regime,
    periodsJson: r.periods_json,
    costsJson: r.costs_json,
    slippageJson: r.slippage_json,
    seed: r.seed,
    gitCommit: r.git_commit,
    resultJson: r.result_json,
    falsificationReason: r.falsification_reason,
    status: r.status,
    experimentHash: r.experiment_hash,
    reproducibility: r.reproducibility,
    createdAt: r.created_at,
  };
}

function rowToHypothesisNode(r: HypothesisRow): StoredHypothesisNode {
  return {
    id: r.id,
    parentId: r.parent_id,
    mutation: r.mutation,
    status: r.status,
    evidenceJson: r.evidence_json,
    createdAt: r.created_at,
  };
}

export function createD1Adapter(db: D1Database): D1PersistenceAdapter {
  return new D1PersistenceAdapter(db);
}

export { MIGRATE as ALPHA_D1_MIGRATION };