import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { CounterKnownSets, MultipleTestingCounters } from './types';

export function emptyKnownSets(): CounterKnownSets {
  return { hypotheses: [], configurations: [], datasets: [], regimes: [], assets: [] };
}

export function withJob(sets: CounterKnownSets, job: ResearchQueueJob): CounterKnownSets {
  return {
    hypotheses: [...new Set([...sets.hypotheses, job.hypothesis])],
    configurations: [...new Set([...sets.configurations, job.configHash])],
    datasets: [...new Set([...sets.datasets, job.dataset])],
    regimes: [...new Set([...sets.regimes, job.regime])],
    assets: [...new Set([...sets.assets, ...job.universe.symbols])],
  };
}

export function emptyCounters(): MultipleTestingCounters {
  return { hypothesesTested: 0, configurations: 0, datasets: 0, regimes: 0, assets: 0, oosPasses: 0 };
}

export function snapshotCounters(sets: CounterKnownSets, oosPasses: number): MultipleTestingCounters {
  return {
    hypothesesTested: sets.hypotheses.length,
    configurations: sets.configurations.length,
    datasets: sets.datasets.length,
    regimes: sets.regimes.length,
    assets: sets.assets.length,
    oosPasses,
  };
}
