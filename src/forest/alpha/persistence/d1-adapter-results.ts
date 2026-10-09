import type { AlphaResult } from '@/tree/alpha/types';
import type { ExperimentResult } from '@/forest/alpha/experiments/types';
import type { D1Database } from '@/lib/db/types';

export async function d1SaveResult(db: D1Database, id: string, r: AlphaResult): Promise<void> {
  const t = Date.now();
  await db.prepare(
    `INSERT INTO alpha_results (id,name,source,result_json,created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, source=excluded.source, result_json=excluded.result_json`,
  ).bind(id, r.name, r.source, JSON.stringify(r), t).run();
}

export async function d1LoadResult(db: D1Database, id: string): Promise<AlphaResult | null> {
  const row = await db.prepare('SELECT result_json FROM alpha_results WHERE id=?').bind(id).first<{ result_json: string }>();
  if (!row?.result_json) return null;
  try { return JSON.parse(row.result_json) as AlphaResult; } catch { return null; }
}

export async function d1SaveExperimentResult(db: D1Database, experimentId: string, result: ExperimentResult): Promise<void> {
  const t = Date.now();
  await db.prepare(
    `INSERT INTO alpha_experiment_results (id,experiment_id,status,result_json,artifacts_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, result_json=excluded.result_json, artifacts_json=excluded.artifacts_json, updated_at=excluded.updated_at`,
  ).bind(`${experimentId}_${result.executedAt}`, experimentId, result.status, JSON.stringify(result), JSON.stringify(result.artifacts), t, t).run();
}

export async function d1LoadExperimentResults(db: D1Database, experimentId: string): Promise<ExperimentResult[]> {
  const { results } = await db.prepare('SELECT result_json FROM alpha_experiment_results WHERE experiment_id=? ORDER BY created_at DESC').bind(experimentId).all<{ result_json: string }>();
  if (!results?.length) return [];
  return results.map(r => { try { return JSON.parse(r.result_json) as ExperimentResult; } catch { return null; } }).filter((x): x is ExperimentResult => x !== null);
}
