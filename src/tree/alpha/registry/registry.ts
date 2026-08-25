// Research Registry — pure functions.
// Immutable operations: every function returns a new registry and never
// mutates its input. No I/O, no randomness, no Node APIs.

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

function emptyCounts(): Record<ResearchStatus, number> {
  return { PROPOSED: 0, RUNNING: 0, SURVIVED: 0, FALSIFIED: 0, ARCHIVED: 0 };
}

function countByStatus(entries: readonly ResearchEntry[]): Record<ResearchStatus, number> {
  const counts = emptyCounts();
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

/** FNV-1a 32-bit hash over a string. Deterministic, dependency-free. */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned 32-bit, zero-padded hex for stable string form.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic hash of the experiment configuration only (excludes
 * outcome fields: result, status, falsificationReason, reproducibility).
 * Same configuration always yields the same hash.
 */
export function entryConfigHash(entry: ResearchEntry): string {
  const config = {
    hypothesis: entry.hypothesis,
    dataSources: entry.dataSources,
    featureSet: entry.featureSet,
    regime: entry.regime,
    trainPeriod: entry.trainPeriod,
    validationPeriod: entry.validationPeriod,
    oosPeriod: entry.oosPeriod,
    costs: entry.costs,
    slippage: entry.slippage,
    seed: entry.seed,
    gitCommit: entry.gitCommit,
  };
  return fnv1a32(canonicalize(config));
}

/** Create an empty registry. */
export function createRegistry(): ResearchRegistry {
  return { entries: [], counts: emptyCounts() };
}

/** Build a registry from a list of entries, enforcing dedup. */
export function createRegistryFromEntries(entries: readonly ResearchEntry[]): ResearchRegistry {
  let registry = createRegistry();
  for (const entry of entries) {
    registry = addEntry(registry, entry);
  }
  return registry;
}

/**
 * Add an entry, returning a NEW registry. Rejects an entry whose
 * hypothesis + configuration hash duplicates an existing entry.
 */
export function addEntry(registry: ResearchRegistry, entry: ResearchEntry): ResearchRegistry {
  if (entry.id.trim() === '') {
    throw new Error('Research entry id must be non-empty');
  }
  if (registry.entries.some((existing) => existing.id === entry.id)) {
    throw new Error(`Duplicate research entry id: ${entry.id}`);
  }
  const hash = entryConfigHash(entry);
  const duplicate = registry.entries.find(
    (existing) =>
      existing.hypothesis === entry.hypothesis && entryConfigHash(existing) === hash,
  );
  if (duplicate) {
    throw new Error(
      `Duplicate research hypothesis+config (id '${duplicate.id}', hash ${hash}): ${entry.hypothesis}`,
    );
  }
  const entries = [...registry.entries, entry];
  return { entries, counts: countByStatus(entries) };
}

/**
 * Falsify an entry by id, returning a NEW registry. The input registry
 * is never mutated. Throws if the id is unknown.
 */
export function falsifyEntry(
  registry: ResearchRegistry,
  id: string,
  reason: string,
): ResearchRegistry {
  const target = registry.entries.find((entry) => entry.id === id);
  if (!target) {
    throw new Error(`Cannot falsify unknown research entry id: ${id}`);
  }
  if (reason.trim() === '') {
    throw new Error(`Falsification reason must be non-empty for entry: ${id}`);
  }
  const entries = registry.entries.map((entry) =>
    entry.id === id
      ? { ...entry, status: 'FALSIFIED' as const, falsificationReason: reason }
      : entry,
  );
  return { entries, counts: countByStatus(entries) };
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
