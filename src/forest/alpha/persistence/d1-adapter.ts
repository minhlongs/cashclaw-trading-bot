import type { AlphaResult } from '@/tree/alpha/types';
import type { ExperimentResult } from '@/forest/alpha/experiments/types';
import type { D1Database } from '@/lib/db/types';
import type { PersistenceAdapter, StoredExperiment } from './types';
import { MIGRATE } from './d1-adapter-schema';
import { type ExperimentWriteParams } from './d1-adapter-queries';
import { d1SaveResult, d1LoadResult, d1SaveExperimentResult, d1LoadExperimentResults } from './d1-adapter-results';
import { d1SaveExperiment, d1LoadExperiment, d1ListExperiments } from './d1-adapter-experiments';

export class D1PersistenceAdapter implements PersistenceAdapter {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async migrate(): Promise<void> {
    for (const sql of MIGRATE.split(';')) {
      const s = sql.trim();
      if (s) await this.db.prepare(s).run();
    }
  }

  saveResult(id: string, r: AlphaResult): Promise<void> { return d1SaveResult(this.db, id, r); }
  loadResult(id: string): Promise<AlphaResult | null> { return d1LoadResult(this.db, id); }
  saveExperiment(e: ExperimentWriteParams): Promise<void> { return d1SaveExperiment(this.db, e); }
  loadExperiment(id: string) { return d1LoadExperiment(this.db, id); }
  listExperiments(): Promise<StoredExperiment[]> { return d1ListExperiments(this.db); }
  saveExperimentResult(experimentId: string, result: ExperimentResult): Promise<void> {
    return d1SaveExperimentResult(this.db, experimentId, result);
  }
  loadExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
    return d1LoadExperimentResults(this.db, experimentId);
  }
}

export function createD1Adapter(db: D1Database): D1PersistenceAdapter { return new D1PersistenceAdapter(db); }
export { MIGRATE as ALPHA_D1_MIGRATION };
