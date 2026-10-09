import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { CounterKnownSets, MultipleTestingCounters } from './types';
import { emptyKnownSets, withJob, snapshotCounters } from './counters-helpers';

export function incrementForJob(
  counters: MultipleTestingCounters,
  job: ResearchQueueJob,
  known: CounterKnownSets = emptyKnownSets(),
): MultipleTestingCounters {
  const merged = withJob(known, job);
  const totalOos = counters.oosPasses + (job.result?.oosPassCount ?? 0);
  return snapshotCounters(merged, totalOos);
}
