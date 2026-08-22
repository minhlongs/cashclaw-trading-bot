// Alpha Persistence — JSON Adapter
// File-based fallback adapter for local development without D1.

import type { AlphaResult } from '@/tree/alpha/types';
import type { Experiment, ExperimentResult } from '@/forest/alpha/experiments/types';
import type { PersistenceAdapter } from './types';

const DIR = 'alpha-artifacts';

function readFile(path: string): string | null {
  try { return require('fs').readFileSync(path, 'utf-8'); } catch { return null; }
}

function writeFile(path: string, data: string): void {
  require('fs').mkdirSync(require('path').dirname(path), { recursive: true });
  require('fs').writeFileSync(path, data, 'utf-8');
}

function fromJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export class JsonPersistenceAdapter implements PersistenceAdapter {
  constructor(private readonly baseDir = DIR) {}

  private resultPath(id: string): string {
    return `${this.baseDir}/results/${id}.json`;
  }

  private experimentPath(id: string): string {
    return `${this.baseDir}/experiments/${id}.json`;
  }

  async saveResult(id: string, result: AlphaResult): Promise<void> {
    writeFile(this.resultPath(id),
      toJson({ ...{ ...result }, _storedAt: Date.now() }));
  }

  async loadResult(id: string): Promise<AlphaResult | null> {
    const raw = readFile(this.resultPath(id));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) as AlphaResult & { _storedAt: number };
      delete (obj as unknown as Record<string, unknown>)._storedAt;
      return obj as AlphaResult;
    } catch { return null; }
  }

  async saveExperiment(experiment: Experiment): Promise<void> {
    writeFile(this.experimentPath(experiment.id),
      toJson({ ...{ ...experiment }, _createdAt: Date.now(), _updatedAt: Date.now() }));
  }

  async loadExperiment(id: string): Promise<Experiment | null> {
    const raw = readFile(this.experimentPath(id));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) as Experiment & { _createdAt: number; _updatedAt: number };
      const mutable = obj as unknown as Record<string, unknown>;
      delete mutable._createdAt;
      delete mutable._updatedAt;
      return obj as Experiment;
    } catch { return null; }
  }

  async listExperiments(): Promise<import('./types').StoredExperiment[]> {
    const fs = require('fs');
    const path = require('path');
    const dir = `${this.baseDir}/experiments`;
    try {
      const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
      const list: import('./types').StoredExperiment[] = [];
      for (const file of files) {
        const raw = readFile(path.join(dir, file));
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw) as Experiment & { _createdAt: number; _updatedAt: number };
          const { _createdAt, _updatedAt, ...rest } = obj;
          list.push({
            id: rest.id,
            hypothesis: rest.hypothesis,
            dataset: rest.dataset,
            symbol: rest.symbol,
            timeframe: rest.timeframe,
            featureSetJson: toJson(rest.featureSet),
            regimeFilterJson: toJson(rest.regimeFilter),
            entryRuleJson: toJson(rest.entryRule),
            exitRuleJson: toJson(rest.exitRule),
            positionSizingJson: toJson(rest.positionSizing),
            feeModelJson: toJson(rest.feeModel),
            slippageModelJson: toJson(rest.slippageModel),
            trainPeriodJson: toJson(rest.trainPeriod),
            validationPeriodJson: toJson(rest.validationPeriod),
            testPeriodJson: toJson(rest.testPeriod),
            randomSeed: rest.randomSeed ?? null,
            gitCommit: rest.gitCommit ?? null,
            configSnapshotJson: toJson(rest.configSnapshot),
            createdAt: _createdAt,
            updatedAt: _updatedAt,
          });
        } catch { /* skip corrupted */ }
      }
      list.sort((a, b) => b.createdAt - a.createdAt);
      return list;
    } catch { return []; }
  }

  async saveExperimentResult(experimentId: string, result: ExperimentResult): Promise<void> {
    const p = `${this.baseDir}/experiments/${experimentId}.results.json`;
    const existing = readFile(p);
    const results: ExperimentResult[] = existing ? JSON.parse(existing) : [];
    results.push(result);
    writeFile(p, toJson(results));
  }

  async loadExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
    const raw = readFile(`${this.baseDir}/experiments/${experimentId}.results.json`);
    return fromJson<ExperimentResult[]>(raw) ?? [];
  }
}

export function createJsonAdapter(baseDir = DIR): JsonPersistenceAdapter {
  return new JsonPersistenceAdapter(baseDir);
}