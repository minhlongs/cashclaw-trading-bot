// Research Registry — summary + canonical JSON export.
// Aggregates counts, OOS passes, and produces stable canonical output.

import { canonicalize } from '@/lib/canonical-json';
import type {
  RegistrySummary,
  ResearchEntry,
  ResearchRegistry,
  ResearchStatus,
} from './types';

const STATUS_ORDER: readonly ResearchStatus[] = [
  'PROPOSED',
  'RUNNING',
  'SURVIVED',
  'FALSIFIED',
  'ARCHIVED',
];

export function emptyCounts(): Record<ResearchStatus, number> {
  return { PROPOSED: 0, RUNNING: 0, SURVIVED: 0, FALSIFIED: 0, ARCHIVED: 0 };
}

export function countByStatus(entries: readonly ResearchEntry[]): Record<ResearchStatus, number> {
  const counts = emptyCounts();
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

/** Aggregate counts + total OOS passes (answers "tested / survived OOS"). */
export function summarize(registry: ResearchRegistry): RegistrySummary {
  let oosPassCount = 0;
  for (const entry of registry.entries) {
    oosPassCount += entry.result.oosPassCount;
  }
  return {
    total: registry.entries.length,
    proposed: registry.counts.PROPOSED,
    running: registry.counts.RUNNING,
    survived: registry.counts.SURVIVED,
    falsified: registry.counts.FALSIFIED,
    archived: registry.counts.ARCHIVED,
    oosPassCount,
  };
}

/** Machine-readable canonical JSON export (sorted keys, stable output). */
export function toCanonicalJson(registry: ResearchRegistry): string {
  return canonicalize({
    entries: registry.entries,
    counts: registry.counts,
    statusOrder: STATUS_ORDER,
  });
}
