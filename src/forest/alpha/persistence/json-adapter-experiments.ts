import type { Experiment } from '@/forest/alpha/experiments/types';
import type { StoredExperiment } from './types';
import { readFile, toJson } from './json-adapter-fs';

export function toStoredExperiment(obj: Experiment & { _createdAt: number; _updatedAt: number }): StoredExperiment {
  const { _createdAt, _updatedAt, ...rest } = obj;
  return {
    id: rest.id, hypothesis: rest.hypothesis, dataset: rest.dataset, symbol: rest.symbol, timeframe: rest.timeframe,
    featureSetJson: toJson(rest.featureSet), regimeFilterJson: toJson(rest.regimeFilter), entryRuleJson: toJson(rest.entryRule),
    exitRuleJson: toJson(rest.exitRule), positionSizingJson: toJson(rest.positionSizing), feeModelJson: toJson(rest.feeModel),
    slippageModelJson: toJson(rest.slippageModel), trainPeriodJson: toJson(rest.trainPeriod), validationPeriodJson: toJson(rest.validationPeriod),
    testPeriodJson: toJson(rest.testPeriod), randomSeed: rest.randomSeed ?? null, gitCommit: rest.gitCommit ?? null,
    configSnapshotJson: toJson(rest.configSnapshot), createdAt: _createdAt, updatedAt: _updatedAt,
  };
}

export function listStoredExperiments(baseDir: string): StoredExperiment[] {
  const fs = require('fs'), path = require('path'), dir = `${baseDir}/experiments`;
  try {
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
    const list: StoredExperiment[] = [];
    for (const file of files) {
      const raw = readFile(path.join(dir, file));
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw) as Experiment & { _createdAt: number; _updatedAt: number };
        list.push(toStoredExperiment(obj));
      } catch { /* skip corrupted */ }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}
