import type { AlphaResult } from '@/tree/alpha/types';
import type { Experiment, ExperimentResult } from '@/forest/alpha/experiments/types';
import type { PersistenceAdapter, StoredExperiment } from './types';
import { DEFAULT_ALPHA_DIR, readFile, writeFile, fromJson, toJson } from './json-adapter-fs';
import { listStoredExperiments } from './json-adapter-experiments';

export class JsonPersistenceAdapter implements PersistenceAdapter {
  constructor(private readonly baseDir = DEFAULT_ALPHA_DIR) {}
  private rPath(id: string): string { return `${this.baseDir}/results/${id}.json`; }
  private expPath(id: string): string { return `${this.baseDir}/experiments/${id}.json`; }
  private resPath(id: string): string { return `${this.baseDir}/experiments/${id}.results.json`; }

  async saveResult(id: string, result: AlphaResult): Promise<void> {
    writeFile(this.rPath(id), toJson({ ...result, _storedAt: Date.now() }));
  }
  async loadResult(id: string): Promise<AlphaResult | null> {
    const raw = readFile(this.rPath(id));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) as AlphaResult & { _storedAt?: number };
      delete obj._storedAt;
      return obj as AlphaResult;
    } catch { return null; }
  }
  async saveExperiment(exp: Experiment): Promise<void> {
    writeFile(this.expPath(exp.id), toJson({ ...exp, _createdAt: Date.now(), _updatedAt: Date.now() }));
  }
  async loadExperiment(id: string): Promise<Experiment | null> {
    const raw = readFile(this.expPath(id));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) as Experiment & { _createdAt?: number; _updatedAt?: number };
      delete obj._createdAt; delete obj._updatedAt;
      return obj as Experiment;
    } catch { return null; }
  }
  async listExperiments(): Promise<StoredExperiment[]> { return listStoredExperiments(this.baseDir); }
  async saveExperimentResult(id: string, res: ExperimentResult): Promise<void> {
    const list = fromJson<ExperimentResult[]>(readFile(this.resPath(id))) ?? [];
    list.push(res); writeFile(this.resPath(id), toJson(list));
  }
  async loadExperimentResults(id: string): Promise<ExperimentResult[]> {
    return fromJson<ExperimentResult[]>(readFile(this.resPath(id))) ?? [];
  }
}
export const createJsonAdapter = (dir = DEFAULT_ALPHA_DIR) => new JsonPersistenceAdapter(dir);
