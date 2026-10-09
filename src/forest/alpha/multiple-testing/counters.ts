import type { ResearchRegistry } from '@/tree/alpha/registry/types';
import type { ResearchQueue } from '@/tree/alpha/queue/types';
import type { CounterKnownSets, MultipleTestingCounters } from './types';
import { snapshotCounters, withJob } from './counters-helpers';

export { emptyCounters } from './counters-helpers';
export { incrementForJob } from './counters-increment';

export function computeCounters(registry: ResearchRegistry, queue: ResearchQueue): MultipleTestingCounters {
  let sets: CounterKnownSets = { hypotheses: [], configurations: [], datasets: [], regimes: [], assets: [] };
  let oosPasses = 0;

  for (const entry of registry.entries) {
    sets = {
      hypotheses: [...new Set([...sets.hypotheses, entry.hypothesis])],
      configurations: [...new Set([...sets.configurations, entry.id])],
      datasets: [...new Set([...sets.datasets, entry.dataSources.join('|')])],
      regimes: [...new Set([...sets.regimes, entry.regime])],
      assets: sets.assets,
    };
    oosPasses += entry.result.oosPassCount;
  }

  for (const job of queue.jobs) {
    sets = withJob(sets, job);
    oosPasses += job.result?.oosPassCount ?? 0;
  }

  return snapshotCounters(sets, oosPasses);
}
