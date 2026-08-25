// Multiple-Testing Defense — Multiple-Testing Counters
// Answers mission §9: "track the number of hypotheses tested,
// configurations, datasets, regimes, assets, and OOS passes". Combines
// the research registry (tree layer) with the research queue (tree layer)
// into one audit snapshot. Pure and deterministic: no I/O, no randomness.

import type { ResearchRegistry } from '@/tree/alpha/registry/types';
import type { ResearchQueue, ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { CounterKnownSets, MultipleTestingCounters } from './types';

function emptyKnownSets(): CounterKnownSets {
  return { hypotheses: [], configurations: [], datasets: [], regimes: [], assets: [] };
}

function withJob(sets: CounterKnownSets, job: ResearchQueueJob): CounterKnownSets {
  return {
    hypotheses: [...new Set([...sets.hypotheses, job.hypothesis])],
    configurations: [...new Set([...sets.configurations, job.configHash])],
    datasets: [...new Set([...sets.datasets, job.dataset])],
    regimes: [...new Set([...sets.regimes, job.regime])],
    assets: [...new Set([...sets.assets, ...job.universe.symbols])],
  };
}

/** Zeroed counters (the identity for accumulation). */
export function emptyCounters(): MultipleTestingCounters {
  return {
    hypothesesTested: 0,
    configurations: 0,
    datasets: 0,
    regimes: 0,
    assets: 0,
    oosPasses: 0,
  };
}

/**
 * Fold one queue job into a counter snapshot against a known-set
 * accumulator, returning a NEW snapshot. Distinct sets grow by at most
 * one value per job; OOS passes add the job's recorded pass count
 * (0 while the job has no result).
 */
export function incrementForJob(
  counters: MultipleTestingCounters,
  job: ResearchQueueJob,
  known: CounterKnownSets = emptyKnownSets(),
): MultipleTestingCounters {
  const merged: CounterKnownSets = {
    hypotheses: [...new Set([...known.hypotheses, job.hypothesis])],
    configurations: [...new Set([...known.configurations, job.configHash])],
    datasets: [...new Set([...known.datasets, job.dataset])],
    regimes: [...new Set([...known.regimes, job.regime])],
    assets: [...new Set([...known.assets, ...job.universe.symbols])],
  };
  return {
    hypothesesTested: merged.hypotheses.length,
    configurations: merged.configurations.length,
    datasets: merged.datasets.length,
    regimes: merged.regimes.length,
    assets: merged.assets.length,
    oosPasses: counters.oosPasses + (job.result?.oosPassCount ?? 0),
  };
}

function snapshot(
  sets: CounterKnownSets,
  oosPasses: number,
): MultipleTestingCounters {
  return {
    hypothesesTested: sets.hypotheses.length,
    configurations: sets.configurations.length,
    datasets: sets.datasets.length,
    regimes: sets.regimes.length,
    assets: sets.assets.length,
    oosPasses,
  };
}

/**
 * Compute the multiple-testing counters over the registry + queue.
 *
 * - hypothesesTested: distinct registry hypotheses + queue hypotheses;
 * - configurations: registry entry count (one hash per enforced-unique
 *   entry) + distinct queue config hashes;
 * - datasets: registry data-source signatures + queue dataset ids;
 * - regimes: registry regime scopes + queue regime labels;
 * - assets: queue universe symbols (registry entries carry no asset field);
 * - oosPasses: summed OOS pass counts from both sources.
 */
export function computeCounters(
  registry: ResearchRegistry,
  queue: ResearchQueue,
): MultipleTestingCounters {
  let sets: CounterKnownSets = {
    hypotheses: [],
    configurations: [],
    datasets: [],
    regimes: [],
    assets: [],
  };
  let oosPasses = 0;

  for (const entry of registry.entries) {
    sets = {
      hypotheses: [...new Set([...sets.hypotheses, entry.hypothesis])],
      configurations: [...new Set([...sets.configurations, entry.id])],
      datasets: [
        ...new Set([...sets.datasets, entry.dataSources.join('|')]),
      ],
      regimes: [...new Set([...sets.regimes, entry.regime])],
      assets: sets.assets,
    };
    oosPasses += entry.result.oosPassCount;
  }

  for (const job of queue.jobs) {
    sets = withJob(sets, job);
    oosPasses += job.result?.oosPassCount ?? 0;
  }

  return snapshot(sets, oosPasses);
}
